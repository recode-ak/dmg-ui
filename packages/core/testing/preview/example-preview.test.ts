import { describe, expect, test } from 'bun:test';
import {
  AssignedTasksScreenDef,
  DialogRenderer,
  ExamplePreview,
  ExampleUiSetDef,
  exampleCodes,
  exampleDialogViews,
  TaskAssignedNotificationDef,
  TaskCardScreenDef,
  TaskCompletedNotificationDef,
  TaskListScreenDef,
} from '../index';

// Помощник рендера примеров (ФР-13): вид примера из Def через представление
// канала — здесь `DialogRenderer` диалогового канала: ему нужны только
// представления, без канала, сервера и приложения. Снимки — в
// `__snapshots__/` рядом (Т-13).

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

  test('заместитель с readOnly — шапка и без действий с uc (ФР-7)', async () => {
    const own = await previewOf().screen(TaskListScreenDef, 'full');
    const delegate = await previewOf(true, true).screen(
      TaskListScreenDef,
      'full',
    );

    expect(delegate).toMatchSnapshot();
    expect(own).toContain('Выполнить выбранные');
    expect(delegate).not.toContain('Выполнить выбранные');
    expect(delegate).not.toEqual(own);
  });
});
