import { describe, expect, test } from 'bun:test';
import { examplePageViews } from '../example/pages';
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
import { PageRenderer } from '../page/client/page-renderer';

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

  test('заместитель с readOnly — шапка и без действий с uc', async () => {
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

// Тот же помощник через страничный канал: `PageRenderer` над представлениями
// `examplePages`. Снимки — отдельный `describe`: имя
// блока входит в ключ снимка, снимки диалога не задеты.

const pagePreviewOf = (delegate = false, readOnly = false) =>
  new ExamplePreview({
    set: ExampleUiSetDef,
    codes: exampleCodes(),
    renderer: new PageRenderer(examplePageViews),
    context: {
      locale: 'ru-RU',
      timeZone: 'Asia/Oral',
      delegate,
      readOnly,
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
