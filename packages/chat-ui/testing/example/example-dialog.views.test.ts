import { describe, expect, test } from 'bun:test';
import type { RenderContext } from 'dmg-ui';
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
import {
  ChatExamples,
  ExampleDialogUiAppDef,
  ExampleLimits,
  ExampleTrimmedUiAppDef,
  ExampleWindowedUiAppDef,
  exampleDialogViews,
  MemoryMessenger,
} from '../index';

// Помощник рендера примеров: вид примера из Def через представление
// канала — здесь `DialogRenderer` диалогового канала: ему нужны только
// представления, без канала, сервера и приложения. Снимки — в
// `__snapshots__/` рядом.

const renderer = () => new DialogRenderer(exampleDialogViews());

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

/**
 * Контекст примеров: место примеров по умолчанию и субъект примеров — без
 * субъекта действия по правам скрыты, и CH-01 видит урезанный вид (D-UI-99).
 */
const EXAMPLES_CONTEXT: RenderContext = {
  locale: 'ru-RU',
  timeZone: 'Asia/Oral',
  delegate: false,
  readOnly: false,
  subject: exampleSubject,
};

describe('CH-01 учебного примера', () => {
  test('CH-01: учебный пример в лимитах мессенджеров трёх приложений — нарушений нет', async () => {
    const limits = new ExampleLimits(
      await ChatExamples.collect({
        set: ExampleUiSetDef,
        codes: exampleCodes(),
        context: EXAMPLES_CONTEXT,
      }),
    );
    const editing = MemoryMessenger.editing().capabilities;

    expect([
      ...limits.check(exampleDialogViews(ExampleDialogUiAppDef), editing),
      ...limits.check(exampleDialogViews(ExampleTrimmedUiAppDef), editing),
      ...limits.check(
        exampleDialogViews(ExampleWindowedUiAppDef),
        MemoryMessenger.windowed(() => 0).capabilities,
      ),
    ]).toEqual([]);
  });
});
