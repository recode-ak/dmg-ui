import { describe, expect, test } from 'bun:test';
import { UiIds } from 'dmg-ui';
import { DialogRenderer } from 'dmg-ui/chat-ui';
import { exampleDialogViews } from 'dmg-ui/chat-ui/testing';
import {
  AssignedTasksScreenDef,
  ExamplePreview,
  ExampleUiSetDef,
  exampleCodes,
  TaskAssignedNotificationDef,
  TaskCardScreenDef,
  TaskCompletedNotificationDef,
  TaskListScreenDef,
} from 'dmg-ui/testing';
import { ArchReport } from 'dmg-ui/testing/fixtures';
import type { InlineKeyboardButton, MessageEntity } from 'dmg-ui/tg-bot';
import {
  EXAMPLE_MOMENT,
  ExampleTelegramPreview,
  exampleTelegramViews,
} from '../index';
import { telegramScene } from '../telegram-graph-scene';

// Перекрытие общего представления под Telegram (D-UI-67): `exampleTelegramViews`
// = общие представления + перекрытие `taskList` и `taskCard`. Проверки —
// точечные `toEqual` по ключевым полям запроса (цвет, дата, отключённая
// кнопка); снимки JSON запроса — в конце файла, их `.snap` создаёт первый
// зелёный прогон автора после этих проверок. Мир — `MemoryBotApi` внутри
// `ExampleTelegramPreview`; таймеров нет.

const ids = new UiIds(ExampleUiSetDef);
const preview = () => new ExampleTelegramPreview(exampleTelegramViews);

/** Формат даты Telegram для вида показа момента — независимо от кода таблицы. */
const FORMATS = {
  date: 'd',
  time: 't',
  dateTime: 'dt',
  relative: 'r',
} as const;

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
    expect(exampleTelegramViews.screen(taskList)).not.toBe(
      exampleDialogViews.screen(taskList),
    );
    expect(exampleTelegramViews.screen(taskCard)).not.toBe(
      exampleDialogViews.screen(taskCard),
    );
  });

  test('assignedTasks и уведомления — те же представления, что в общем', () => {
    expect(exampleTelegramViews.screen(assigned)).toBe(
      exampleDialogViews.screen(assigned),
    );
    for (const id of notes) {
      expect(exampleTelegramViews.notification(id)).toBe(
        exampleDialogViews.notification(id),
      );
    }
  });

  test('presented() — тот же состав: рёбер presents не больше', () => {
    expect([...exampleTelegramViews.presented()].sort()).toEqual(
      [...exampleDialogViews.presented()].sort(),
    );
  });
});

describe('один код экранов — два представления', () => {
  const common = new DialogRenderer(exampleDialogViews);
  const over = new DialogRenderer(exampleTelegramViews);
  const shared = new ExampleTelegramPreview(exampleDialogViews);

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
    expect(own).not.toBe(general);
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

  test('taskList empty: без выбора «Выполнить выбранные» нет, цвета нет совсем', async () => {
    const request = await preview().screen(TaskListScreenDef, 'empty');
    const all = buttons(request.reply_markup);

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
    const found = dateTimes(request.entities);

    expect(found).toHaveLength(1);
    const [entity] = found;
    expect(entity).toEqual({
      type: 'date_time',
      offset: entity?.offset ?? -1,
      length: entity?.length ?? -1,
      unix_time: EXAMPLE_MOMENT.at,
      date_time_format: FORMATS[EXAMPLE_MOMENT.show],
    });
    const fallback = request.text.slice(
      entity?.offset,
      (entity?.offset ?? 0) + (entity?.length ?? 0),
    );
    expect(fallback.length).toBeGreaterThan(0);
    expect(fallback.trim()).toBe(fallback);
  });

  test('taskCard done: кнопки «Выполнить» нет — нет и цвета', async () => {
    const request = await preview().screen(TaskCardScreenDef, 'done');
    const all = buttons(request.reply_markup);

    expect(all.map((button) => button.text)).not.toContain('Выполнить');
    for (const button of all) {
      expect(button).not.toHaveProperty('style');
    }
  });

  test('ушедший экран: одна отключённая кнопка с подписью нажатого, текст не правится', async () => {
    const request = await preview().retired(
      TaskListScreenDef,
      'full',
      'Выполнить выбранные',
    );

    expect(request.reply_markup).toEqual({
      inline_keyboard: [[{ text: 'Выполнить выбранные', disabled: {} }]],
    });
    expect(request).not.toHaveProperty('text');
  });

  test('запросы укладываются в лимиты Bot API: текст 4096, подпись 64', async () => {
    const requests = [
      await preview().screen(TaskListScreenDef, 'empty'),
      await preview().screen(TaskListScreenDef, 'full'),
      await preview().screen(TaskCardScreenDef, 'open'),
      await preview().screen(TaskCardScreenDef, 'done'),
      await preview().screen(AssignedTasksScreenDef, 'two'),
    ];

    for (const request of requests) {
      expect(request.text.length).toBeGreaterThan(0);
      expect(request.text.length).toBeLessThanOrEqual(4096);
      for (const button of buttons(request.reply_markup)) {
        expect(button.text.length).toBeLessThanOrEqual(64);
      }
    }
  });
});

describe('сцена графа Telegram на exampleTelegramViews', () => {
  test('CH-01…CH-03 и TG-01…TG-06 без нарушений, код 0', () => {
    const report = ArchReport.of(
      telegramScene({
        entryPoints: [
          { entry: 'start', via: 'command', key: 'start' },
          { entry: 'assigned', via: 'menu', key: 'assigned' },
          { entry: 'assigned', via: 'link', key: 'assigned' },
        ],
        views: exampleTelegramViews,
      }),
    );

    expect(report.lines).toEqual([
      'arch:check example: нарушений — 0',
      'arch:check: нарушений нет',
    ]);
    expect(report.code).toBe(0);
  });
});

// Снимки — JSON запроса Telegram (`text`, `entities`, `reply_markup`), не
// «вид для человека»; общие снимки `DialogRenderer` — в
// `chat-ui/testing/example/`.
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
