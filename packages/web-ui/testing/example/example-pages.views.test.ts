import { describe, expect, test } from 'bun:test';
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
import { PageRenderer } from 'dmg-ui/web-ui';
import { examplePagesViews } from './example-pages.views';

// Помощник рендера примеров: вид примера из Def через представление
// канала — здесь `PageRenderer` страничного канала: ему нужны только
// представления, без канала, сервера и приложения. Снимки — в
// `__snapshots__/` рядом; снимки другого канала — в его пакете.

const pagePreviewOf = (delegate = false, readOnly = false) =>
  new ExamplePreview({
    set: ExampleUiSetDef,
    codes: exampleCodes(),
    renderer: new PageRenderer(examplePagesViews),
    context: {
      locale: 'ru-RU',
      timeZone: 'Asia/Oral',
      delegate,
      readOnly,
      subject: exampleSubject,
    },
  });

describe('ExamplePreview через PageRenderer — снимки примеров', () => {
  test('taskList empty', async () => {
    expect(
      await pagePreviewOf().screen(TaskListScreenDef, 'empty'),
    ).toMatchSnapshot();
  });

  test('taskList full', async () => {
    expect(
      await pagePreviewOf().screen(TaskListScreenDef, 'full'),
    ).toMatchSnapshot();
  });

  test('taskCard done — «Выполнить» недоступно по данным', async () => {
    expect(
      await pagePreviewOf().screen(TaskCardScreenDef, 'done'),
    ).toMatchSnapshot();
  });

  test('assignedTasks two', async () => {
    expect(
      await pagePreviewOf().screen(AssignedTasksScreenDef, 'two'),
    ).toMatchSnapshot();
  });

  test('mainMenu start', async () => {
    expect(
      await pagePreviewOf().screen(MainMenuScreenDef, 'start'),
    ).toMatchSnapshot();
  });

  test('уведомление taskAssigned sample', () => {
    expect(
      pagePreviewOf().notification(TaskAssignedNotificationDef, 'sample'),
    ).toMatchSnapshot();
  });

  test('уведомление taskCompleted sample', () => {
    expect(
      pagePreviewOf().notification(TaskCompletedNotificationDef, 'sample'),
    ).toMatchSnapshot();
  });

  test('заместитель с readOnly — шапка и без действий с uc', async () => {
    const own = await pagePreviewOf().screen(TaskListScreenDef, 'full');
    const delegate = await pagePreviewOf(true, true).screen(
      TaskListScreenDef,
      'full',
    );

    expect(delegate).toMatchSnapshot();
    expect(own).toContain('Выполнить выбранные');
    expect(delegate).not.toContain('Выполнить выбранные');
    expect(delegate).not.toEqual(own);
  });
});
