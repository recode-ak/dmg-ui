import { describe, expect, test } from 'bun:test';
import { DialogRenderer } from 'dmg-ui/chat-ui';
import {
  AssignedTasksScreenDef,
  ExamplePreview,
  ExampleUiSetDef,
  exampleCodes,
  exampleSubject,
  MainMenuScreenDef,
  TaskAssignedNotificationDef,
  TaskCardScreenDef,
  TaskCompletedNotificationDef,
  TaskListScreenDef,
} from 'dmg-ui/testing';
import { exampleDialogViews } from '../index';

// Помощник рендера примеров: вид примера из Def через представление
// канала — здесь `DialogRenderer` диалогового канала: ему нужны только
// представления, без канала, сервера и приложения. Снимки — в
// `__snapshots__/` рядом.

const renderer = () => new DialogRenderer(exampleDialogViews);

const previewOf = (delegate = false, readOnly = false) =>
  new ExamplePreview({
    set: ExampleUiSetDef,
    codes: exampleCodes(),
    renderer: renderer(),
    context: {
      locale: 'ru-RU',
      timeZone: 'Asia/Oral',
      delegate,
      readOnly,
      subject: exampleSubject,
    },
  });

describe('ExamplePreview через DialogRenderer — снимки примеров', () => {
  test('taskList empty', async () => {
    expect(
      await previewOf().screen(TaskListScreenDef, 'empty'),
    ).toMatchSnapshot();
  });

  test('taskList full', async () => {
    expect(
      await previewOf().screen(TaskListScreenDef, 'full'),
    ).toMatchSnapshot();
  });

  test('taskCard done — «Выполнить» недоступно по данным', async () => {
    const text = await previewOf().screen(TaskCardScreenDef, 'done');

    expect(text).toMatchSnapshot();
  });

  test('assignedTasks two', async () => {
    expect(
      await previewOf().screen(AssignedTasksScreenDef, 'two'),
    ).toMatchSnapshot();
  });

  test('mainMenu start', async () => {
    expect(
      await previewOf().screen(MainMenuScreenDef, 'start'),
    ).toMatchSnapshot();
  });

  test('уведомление taskAssigned sample', () => {
    expect(
      previewOf().notification(TaskAssignedNotificationDef, 'sample'),
    ).toMatchSnapshot();
  });

  test('уведомление taskCompleted sample', () => {
    expect(
      previewOf().notification(TaskCompletedNotificationDef, 'sample'),
    ).toMatchSnapshot();
  });

  test('заместитель с readOnly — шапка, действия с uc помечены отключёнными', async () => {
    const own = await previewOf().screen(TaskListScreenDef, 'full');
    const delegate = await previewOf(true, true).screen(
      TaskListScreenDef,
      'full',
    );

    expect(delegate).toMatchSnapshot();
    expect(own).toContain('[Выполнить выбранные]');
    expect(delegate).toContain('[🚫 Выполнить выбранные]');
    expect(delegate).not.toContain('[Выполнить выбранные]');
    expect(delegate).not.toEqual(own);
  });
});
