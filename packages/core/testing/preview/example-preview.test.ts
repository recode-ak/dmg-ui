import { describe, expect, test } from 'bun:test';
import {
  AwaitingBus,
  MemoryLogger,
  testUuid,
  useTempDir,
} from 'dmg-core/testing';
import { ExampleApp } from 'dmg-core/testing/example';
import { ApiAppDispatch, UiServer } from 'dmg-ui/server';
import {
  AssignedTasksScreenDef,
  DialogChannel,
  ExampleDialogAppDef,
  ExamplePreview,
  ExampleUiSetDef,
  exampleCodes,
  exampleDialogViews,
  MemoryUiObserver,
  TaskAssignedNotificationDef,
  TaskCardScreenDef,
  TaskCompletedNotificationDef,
  TaskListScreenDef,
} from '../index';
import { T0 } from '../ui-server-fixture';

// Помощник рендера примеров (ФР-13): вид примера из Def через представление
// канала — здесь `DialogRenderer` диалогового канала. Снимки — в
// `__snapshots__/` рядом (Т-13).

const tmp = useTempDir('dmg-ui-example-preview-');

/** Рендерер диалогового канала: канал собирается на учебном приложении. */
const renderer = () => {
  const bus = new AwaitingBus();
  const context = { bus, logger: new MemoryLogger() };
  const example = new ExampleApp(
    { mode: 'test', dataDir: tmp().path, users: [testUuid(1)] },
    { ...context, clock: () => T0 },
  );
  return new DialogChannel({
    app: ExampleDialogAppDef,
    codes: exampleCodes(),
    server: new UiServer({
      set: ExampleUiSetDef,
      dispatch: new ApiAppDispatch(example.api),
      context,
    }),
    views: exampleDialogViews,
    observer: new MemoryUiObserver(),
    identities: () => example.callers,
  }).renderer();
};

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

describe('ExamplePreview — ошибка в примере', () => {
  test('нет примера экрана — бросок', async () => {
    const preview = previewOf();
    let error: unknown;
    try {
      await preview.screen(TaskListScreenDef, 'missing');
    } catch (thrown) {
      error = thrown;
    }

    expect(String(error)).toContain('missing');
  });

  test('нет примера уведомления — бросок', () => {
    expect(() =>
      previewOf().notification(TaskAssignedNotificationDef, 'missing'),
    ).toThrow('missing');
  });
});
