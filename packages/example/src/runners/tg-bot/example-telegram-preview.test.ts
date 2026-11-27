import { describe, expect, test } from 'bun:test';
import { UiIds } from 'dmg-ui';
import { DialogRenderer } from 'dmg-ui/chat-ui';
import { ExamplePreview } from 'dmg-ui/testing';
import type { InlineKeyboardButton, MessageEntity } from 'dmg-ui/tg-bot';
import {
  AssignedTasksScreenDef,
  ExampleUiSetDef,
  TaskAssignedNotificationDef,
  TaskCardScreenDef,
  TaskCompletedNotificationDef,
  TaskListScreenDef,
} from '../../platform/ui';
import { exampleDialogViews } from '../dialog/example-dialog-views';
import { exampleCodes } from '../example-codes';
import { EXAMPLE_CONTEXT } from './example-telegram.const';
import { ExampleTelegramPreview } from './example-telegram-preview';
import { exampleTelegramViews } from './example-telegram-views';

// Перекрытие общего представления под Telegram (D-UI-67): `exampleTelegramViews`
// = общие представления + перекрытие `taskList` и `taskCard`. Проверки —
// точечные `toEqual` по ключевым полям запроса (цвет, дата, отключённая
// кнопка); снимки JSON запроса — в конце файла, их `.snap` создаёт первый
// зелёный прогон автора после этих проверок. Мир — `MemoryBotApi` внутри
// `ExampleTelegramPreview`; таймеров нет.

const ids = new UiIds(ExampleUiSetDef);
const preview = () => new ExampleTelegramPreview(exampleTelegramViews());

const buttons = (
  markup:
    | { inline_keyboard: readonly (readonly InlineKeyboardButton[])[] }
    | undefined,
): InlineKeyboardButton[] =>
  (markup?.inline_keyboard ?? []).flatMap((row) => [...row]);

const dateTimes = (entities: readonly MessageEntity[] | undefined) =>
  (entities ?? []).filter((entity) => entity.type === 'date_time');

describe('exampleTelegramViews — перекрытие по id', () => {
  const taskList = ids.screen(TaskListScreenDef);
  const taskCard = ids.screen(TaskCardScreenDef);
  const assigned = ids.screen(AssignedTasksScreenDef);
  const notes = [
    ids.notification(TaskAssignedNotificationDef),
    ids.notification(TaskCompletedNotificationDef),
  ];

  test('taskList и taskCard — свои представления, не общие', () => {
    expect(exampleTelegramViews().screen(taskList)).not.toBe(
      exampleDialogViews().screen(taskList),
    );
    expect(exampleTelegramViews().screen(taskCard)).not.toBe(
      exampleDialogViews().screen(taskCard),
    );
  });

  test('assignedTasks и уведомления — те же представления, что в общем', () => {
    expect(exampleTelegramViews().screen(assigned)).toBe(
      exampleDialogViews().screen(assigned),
    );
    for (const id of notes) {
      expect(exampleTelegramViews().notification(id)).toBe(
        exampleDialogViews().notification(id),
      );
    }
  });
});

describe('один код экранов — два представления', () => {
  const common = new DialogRenderer(exampleDialogViews());
  const over = new DialogRenderer(exampleTelegramViews());
  const shared = new ExampleTelegramPreview(exampleDialogViews());

  /** Человекочитаемый вид общего экрана одинаков: подписи те же, цвет в нём не виден. */
  const textOf = (
    views: DialogRenderer,
    def: typeof TaskListScreenDef | typeof TaskCardScreenDef,
    example: string,
  ) =>
    new ExamplePreview({
      set: ExampleUiSetDef,
      codes: exampleCodes(),
      renderer: views,
      context: EXAMPLE_CONTEXT,
    }).screen(def, example);

  test('taskList full: подписи и текст те же в общем и перекрытом', async () => {
    expect(await textOf(over, TaskListScreenDef, 'full')).toBe(
      await textOf(common, TaskListScreenDef, 'full'),
    );
  });

  test('taskCard open: перекрытый показ дописывает запасной текст момента, подписи те же', async () => {
    const own = await textOf(over, TaskCardScreenDef, 'open');
    const general = await textOf(common, TaskCardScreenDef, 'open');

    expect(own).toContain('[Выполнить]');
    expect(own).toContain('20 ноября 2026, 12:00');
    expect(general).not.toContain('20 ноября 2026, 12:00');
  });

  test('assignedTasks two: запрос Telegram у общего и перекрытого реестра одинаков', async () => {
    expect(await preview().screen(AssignedTasksScreenDef, 'two')).toEqual(
      await shared.screen(AssignedTasksScreenDef, 'two'),
    );
  });

  test('общий реестр в Telegram: ни цвета, ни даты', async () => {
    const full = await shared.screen(TaskListScreenDef, 'full');
    const open = await shared.screen(TaskCardScreenDef, 'open');

    for (const button of [
      ...buttons(full.reply_markup),
      ...buttons(open.reply_markup),
    ]) {
      expect(button).not.toHaveProperty('style');
    }
    expect(dateTimes(open.entities)).toEqual([]);
  });
});

describe('Telegram: перекрытые экраны — ключевые поля запроса', () => {
  test('taskList full: success только у «Выполнить выбранные»', async () => {
    const request = await preview().screen(TaskListScreenDef, 'full');
    const all = buttons(request.reply_markup);
    const finish = all.filter(
      (button) => button.text === 'Выполнить выбранные',
    );

    expect(finish).toHaveLength(1);
    expect(finish[0]).toHaveProperty('style', 'success');
    expect(finish[0]).toHaveProperty('callback_data');
    const others = all.filter(
      (button) => button.text !== 'Выполнить выбранные',
    );
    expect(others.length).toBeGreaterThan(0);
    for (const button of others) {
      expect(button).not.toHaveProperty('style');
    }
  });

  test('taskList full: кнопка на каждую задачу вместо «Открыть задачу», с callback_data', async () => {
    const request = await preview().screen(TaskListScreenDef, 'full');
    const all = buttons(request.reply_markup);
    const tasks = all.filter((button) =>
      ['Хлеб', 'Молоко'].includes(button.text),
    );

    expect(tasks.map((button) => button.text)).toEqual(['Хлеб', 'Молоко']);
    expect(all.map((button) => button.text)).not.toContain('Открыть задачу');
    for (const button of tasks) expect(button).toHaveProperty('callback_data');
  });

  test('taskList empty: без выбора кнопка помечена «🚫 Выполнить выбранные» (callback_data, без disabled), обычной нет, цвета нет совсем', async () => {
    const request = await preview().screen(TaskListScreenDef, 'empty');
    const all = buttons(request.reply_markup);
    const marked = all.filter(
      (button) => button.text === '🚫 Выполнить выбранные',
    );

    expect(marked).toHaveLength(1);
    expect(marked[0]).toHaveProperty('callback_data');
    expect(marked[0]).not.toHaveProperty('disabled');
    expect(all.map((button) => button.text)).not.toContain(
      'Выполнить выбранные',
    );
    for (const button of all) {
      expect(button).not.toHaveProperty('style');
    }
  });

  test('taskCard open: «Выполнить» — success, остальные без цвета', async () => {
    const request = await preview().screen(TaskCardScreenDef, 'open');
    const all = buttons(request.reply_markup);
    const complete = all.filter((button) => button.text === 'Выполнить');

    expect(complete).toHaveLength(1);
    expect(complete[0]).toHaveProperty('style', 'success');
    for (const button of all.filter((one) => one.text !== 'Выполнить')) {
      expect(button).not.toHaveProperty('style');
    }
  });

  test('taskCard open: date_time с EXAMPLE_MOMENT и запасным текстом внутри текста', async () => {
    const request = await preview().screen(TaskCardScreenDef, 'open');

    expect(request.text).toBe(
      'Задача: Хлеб\nСтатус: открыта\nНапоминание (пример): 20 ноября 2026, 12:00',
    );
    expect(dateTimes(request.entities)).toEqual([
      {
        type: 'date_time',
        offset: 51,
        length: 21,
        unix_time: 1795158000,
        date_time_format: 'dt',
      },
    ]);
  });

  test('taskCard done: кнопка помечена «🚫 Выполнить» (callback_data, без disabled), обычной нет — цвета нет', async () => {
    const request = await preview().screen(TaskCardScreenDef, 'done');
    const all = buttons(request.reply_markup);
    const marked = all.filter((button) => button.text === '🚫 Выполнить');

    expect(marked).toHaveLength(1);
    expect(marked[0]).toHaveProperty('callback_data');
    expect(marked[0]).not.toHaveProperty('disabled');
    expect(all.map((button) => button.text)).not.toContain('Выполнить');
    for (const button of all) {
      expect(button).not.toHaveProperty('style');
    }
  });

  test('ушедший экран: прежний текст и строка «Вы выбрали», клавиатуры нет', async () => {
    const request = await preview().retired(
      TaskListScreenDef,
      'full',
      'Выполнить выбранные',
    );

    expect(
      request.text.endsWith('\n-----\nВы выбрали: Выполнить выбранные'),
    ).toBe(true);
    expect(request).not.toHaveProperty('reply_markup');
  });
});

// Снимки — JSON запроса Telegram (`text`, `entities`, `reply_markup`), не
// «вид для человека»; общие снимки `DialogRenderer` — в раннере `dialog`
// (`example-dialog-views.test.ts`).
describe('снимки запросов Telegram', () => {
  test('taskList empty', async () => {
    expect(
      await preview().screen(TaskListScreenDef, 'empty'),
    ).toMatchSnapshot();
  });

  test('taskList full', async () => {
    expect(await preview().screen(TaskListScreenDef, 'full')).toMatchSnapshot();
  });

  test('taskCard done', async () => {
    expect(await preview().screen(TaskCardScreenDef, 'done')).toMatchSnapshot();
  });

  test('taskCard open — с датой', async () => {
    expect(await preview().screen(TaskCardScreenDef, 'open')).toMatchSnapshot();
  });

  test('assignedTasks two — общее представление, не перекрыто', async () => {
    expect(
      await preview().screen(AssignedTasksScreenDef, 'two'),
    ).toMatchSnapshot();
  });

  test('запрос retire ушедшего экрана', async () => {
    expect(
      await preview().retired(TaskListScreenDef, 'full', 'Выполнить выбранные'),
    ).toMatchSnapshot();
  });
});
