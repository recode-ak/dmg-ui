import { describe, expect, test } from 'bun:test';
import {
  AwaitingBus,
  MemoryLogger,
  testUuid,
  useTempDir,
} from 'dmg-core/testing';
import { ExampleApp } from 'dmg-core/testing/example';
import type { CommunitySignal } from 'dmg-ui/chat-ui';
import {
  type ConversationSignal,
  Conversations,
  MemoryConversationStore,
} from 'dmg-ui/chat-ui';
import {
  ExampleDialogUiAppDef,
  exampleDialogViews,
} from 'dmg-ui/chat-ui/testing';
import { ApiAppDispatch, UiServer } from 'dmg-ui/server';
import {
  ExampleUiSetDef,
  exampleCodes,
  MemoryUiObserver,
} from 'dmg-ui/testing';
import { T0 } from 'dmg-ui/testing/fixtures';
import { MemoryBotApi, TestUpdates } from '../../testing';
import { TelegramMessenger } from '../messenger/telegram-messenger';
import { TelegramUpdates } from './telegram-updates';

// Приём апдейтов Telegram: сигнал беседы уходит в узел бесед; отвергнутое
// нажатие получает ровно один ответ без текста через мессенджер, сигнала
// нет; апдейт вне диалога — ничего, без записи; апдейт не по схеме — `warn`
// без данных. `receive` не бросает. Перевод апдейта в сигнал по видам —
// `telegram-signals.test.ts`; здесь — что уходит в узел бесед, в порт и в лог.

const ME = 7350001234;
/** id самого бота (`getMe`): нужен приёму для отсева эха, в сценах личного чата не участвует. */
const BOT = 7350007777;
const A = testUuid(1);
const tmp = useTempDir('dmg-ui-telegram-updates-');
/** Точки входа проекта: `/start`, `/tasks` и меню — на вход `start`, ссылка `abc` — на `assigned`. */
const ENTRY_POINTS = [
  { entry: 'start', via: 'command', key: 'start' },
  { entry: 'start', via: 'menu', key: 'tasks' },
  { entry: 'assigned', via: 'link', key: 'abc' },
];
const OTHER = 7350009999;
const GROUP = -1004001234567;
const NEWBIE = 7350003333;
const ADMIN = 7350002222;
const PRESS = 'cq-secret-7';
const DATA = 'r1secret';
const SECRET_TEXT = 'Хлеб-секрет';

const user = (id = ME) => ({ id, is_bot: false, first_name: 'Нурлан' });
const chat = (id = ME, type = 'private') => ({ id, type });

const text = (value = SECRET_TEXT, where = chat()) => ({
  update_id: 101,
  message: {
    message_id: 5,
    date: 1_700_000_000,
    chat: where,
    from: user(),
    text: value,
  },
});

const press = (fields: Record<string, unknown> = {}) => ({
  update_id: 102,
  callback_query: {
    id: PRESS,
    from: user(),
    chat_instance: '-5550001',
    message: { message_id: 5, date: 1_700_000_000, chat: chat() },
    data: DATA,
    ...fields,
  },
});

/** Нажатие без поля `key` и с полями `fields`. */
const pressWithout = (key: string, fields: Record<string, unknown>) => ({
  update_id: 102,
  callback_query: Object.fromEntries(
    Object.entries({ ...press().callback_query, ...fields }).filter(
      ([name]) => name !== key,
    ),
  ),
});

type Receiver = (signal: ConversationSignal) => Promise<void>;

/** Приём апдейтов на подставном порту; узел бесед записывает сигналы. */
const setup = (
  receive?: Receiver,
  entryPoints: readonly (typeof ENTRY_POINTS)[number][] = ENTRY_POINTS,
  communities?: { receive(signal: CommunitySignal): Promise<void> },
) => {
  const api = new MemoryBotApi();
  const logger = new MemoryLogger();
  const messenger = new TelegramMessenger({ api, logger });
  const signals: ConversationSignal[] = [];
  const conversations = {
    receive:
      receive ??
      (async (signal: ConversationSignal) => {
        signals.push(signal);
      }),
  };
  const updates = new TelegramUpdates({
    conversations,
    messenger,
    logger,
    entryPoints,
    bot: BOT,
    ...(communities === undefined ? {} : { communities }),
  });
  return { api, logger, signals, updates };
};

/** Запись лога не содержит ни одного из значений собеседника. */
const clean = (logger: MemoryLogger) => {
  const json = JSON.stringify(logger.records);
  for (const value of [
    String(ME),
    String(OTHER),
    String(GROUP),
    String(NEWBIE),
    String(ADMIN),
    PRESS,
    DATA,
    SECRET_TEXT,
  ]) {
    expect(json).not.toContain(value);
  }
};

describe('TelegramUpdates — сигнал в узел бесед', () => {
  test('личный текст уходит сигналом text; порт не вызван, лог пуст', async () => {
    const { api, logger, signals, updates } = setup();
    await updates.receive(text('Хлеб'));
    expect(signals).toEqual([
      {
        id: '101',
        peer: String(ME),
        sender: String(ME),
        kind: 'text',
        text: 'Хлеб',
      },
    ]);
    expect(api.journal).toEqual([]);
    expect(logger.records).toEqual([]);
  });

  test('личное нажатие уходит сигналом press; ответ даёт беседа, не приём апдейтов', async () => {
    const { api, signals, updates } = setup();
    await updates.receive(press());
    expect(signals).toEqual([
      {
        id: '102',
        peer: String(ME),
        sender: String(ME),
        kind: 'press',
        ref: DATA,
        press: PRESS,
      },
    ]);
    expect(api.journal).toEqual([]);
  });
});

describe('TelegramUpdates — вне диалога', () => {
  for (const [name, type] of [
    ['группе', 'group'],
    ['супергруппе', 'supergroup'],
    ['канале', 'channel'],
  ] as const) {
    test(`сообщение в ${name} — сигнала нет, порт не вызван, записей нет`, async () => {
      const { api, logger, signals, updates } = setup();
      await updates.receive(text(SECRET_TEXT, chat(GROUP, type)));
      expect(signals).toEqual([]);
      expect(api.journal).toEqual([]);
      expect(logger.records).toEqual([]);
    });
  }

  test('нажатие чужого чата не исполняется: в группе сигнала нет, ровно один ответ без текста', async () => {
    const { api, logger, signals, updates } = setup();
    await updates.receive(
      press({
        message: {
          message_id: 5,
          date: 1_700_000_000,
          chat: chat(GROUP, 'supergroup'),
        },
      }),
    );
    expect(signals).toEqual([]);
    expect(api.journal).toEqual([
      { method: 'answerCallbackQuery', params: { callback_query_id: PRESS } },
    ]);
    clean(logger);
  });

  test('нажатие чужого человека не исполняется: личный чат, from.id ≠ chat.id — сигнала нет, один ответ', async () => {
    const { api, logger, signals, updates } = setup();
    await updates.receive(press({ from: user(OTHER) }));
    expect(signals).toEqual([]);
    expect(api.journal).toEqual([
      { method: 'answerCallbackQuery', params: { callback_query_id: PRESS } },
    ]);
    expect(logger.records.map((record) => record.meta)).toEqual([
      { messenger: 'telegram', reason: 'sender', update: 'callback_query' },
    ]);
    clean(logger);
  });

  test('личное сообщение чужого человека — сигнала нет, порт не вызван, warn с видом message', async () => {
    const { api, logger, signals, updates } = setup();
    await updates.receive({
      update_id: 101,
      message: { ...text().message, from: user(OTHER) },
    });
    expect(signals).toEqual([]);
    expect(api.journal).toEqual([]);
    expect(logger.records.map((record) => record.meta)).toEqual([
      { messenger: 'telegram', reason: 'sender', update: 'message' },
    ]);
    clean(logger);
  });

  test('нажатие без message (инлайн-режим) — сигнала нет, один ответ', async () => {
    const { api, signals, updates } = setup();
    await updates.receive(
      pressWithout('message', { inline_message_id: 'im-1' }),
    );
    expect(signals).toEqual([]);
    expect(api.journal).toEqual([
      { method: 'answerCallbackQuery', params: { callback_query_id: PRESS } },
    ]);
  });

  test('нажатие без data — сигнала нет, один ответ', async () => {
    const { api, signals, updates } = setup();
    await updates.receive(pressWithout('data', { game_short_name: 'game' }));
    expect(signals).toEqual([]);
    expect(api.journal).toEqual([
      { method: 'answerCallbackQuery', params: { callback_query_id: PRESS } },
    ]);
  });

  test.each(['edited_message', 'channel_post'])(
    '%s — ничего: сигнала нет, порт не вызван, записей лога нет',
    async (key) => {
      const { api, logger, signals, updates } = setup();
      await updates.receive({
        update_id: 103,
        [key]: {
          message_id: 6,
          date: 1_700_000_000,
          chat: chat(GROUP, 'supergroup'),
          from: user(),
          text: SECRET_TEXT,
        },
      });
      expect(signals).toEqual([]);
      expect(api.journal).toEqual([]);
      expect(logger.records).toEqual([]);
    },
  );

  test('ответ на отвергнутое нажатие бросил порт — receive не бросает', async () => {
    const { api, logger, signals, updates } = setup();
    api.throwNext(new TypeError(`сеть ${PRESS}`));
    await expect(
      updates.receive(press({ from: user(OTHER) })),
    ).resolves.toBeUndefined();
    expect(signals).toEqual([]);
    expect(api.journal.map((call) => call.method)).toEqual([
      'answerCallbackQuery',
    ]);
    // Сначала ответ (его сбой — error мессенджера), затем запись отказа.
    expect(logger.records.map((record) => record.level)).toEqual([
      'error',
      'warn',
    ]);
    clean(logger);
  });
});

describe('TelegramUpdates — апдейт не по схеме', () => {
  for (const [name, update] of [
    ['не объект', 'update'],
    ['null', null],
    ['нет update_id', { message: text().message }],
    [
      'from не объект',
      { ...text(), message: { ...text().message, from: 'Нурлан' } },
    ],
    ['числа строками', { ...text(), update_id: '101' }],
    [
      'chat.id строкой',
      {
        ...text(),
        message: {
          ...text().message,
          chat: { id: String(ME), type: 'private' },
        },
      },
    ],
  ] as const) {
    test(`${name} — сигнала нет, один warn без данных, receive не бросает`, async () => {
      const { api, logger, signals, updates } = setup();
      await expect(updates.receive(update)).resolves.toBeUndefined();
      expect(signals).toEqual([]);
      expect(api.journal).toEqual([]);
      expect(logger.records.map((record) => record.level)).toEqual(['warn']);
      expect(logger.records[0]?.meta).toEqual({
        messenger: 'telegram',
        reason: 'schema',
      });
      clean(logger);
    });
  }

  test('объект с бросающим геттером — receive не бросает, отказ schema без данных', async () => {
    const { api, logger, signals, updates } = setup();
    const hostile = {
      get update_id(): number {
        throw new Error(`секрет ${ME}`);
      },
    };

    await expect(updates.receive(hostile)).resolves.toBeUndefined();

    expect(signals).toEqual([]);
    expect(api.journal).toEqual([]);
    expect(logger.records.map((record) => record.level)).toEqual(['warn']);
    expect(logger.records[0]?.meta).toEqual({
      messenger: 'telegram',
      reason: 'schema',
    });
    clean(logger);
  });

  test('нажатие не по схеме, id читается — ответ есть, сигнала нет, warn без данных', async () => {
    const { api, logger, signals, updates } = setup();
    await updates.receive(press({ from: { id: String(ME) } }));
    expect(signals).toEqual([]);
    expect(api.journal).toEqual([
      { method: 'answerCallbackQuery', params: { callback_query_id: PRESS } },
    ]);
    expect(logger.records.map((record) => record.meta)).toEqual([
      { messenger: 'telegram', reason: 'schema', update: 'callback_query' },
    ]);
    clean(logger);
  });
});

describe('TelegramUpdates — сбой узла бесед', () => {
  test('conversations.receive бросает — receive не бросает, error с именем ошибки без её текста', async () => {
    const { logger, updates } = setup(async () => {
      throw new RangeError(`сбой ${SECRET_TEXT}`);
    });
    await expect(updates.receive(text())).resolves.toBeUndefined();
    const errors = logger.records.filter((record) => record.level === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.source).toBe('tg-bot');
    expect(errors[0]?.meta).toMatchObject({ name: 'RangeError' });
    clean(logger);
  });
});

describe('TelegramUpdates — точки входа', () => {
  test('/start <параметр ссылки> → вход точки link; параметр в сигнал и в лог не попадает', async () => {
    const { api, logger, signals, updates } = setup();

    await updates.receive(new TestUpdates().text(ME, '/start abc'));

    expect(signals).toStrictEqual([
      {
        id: '1',
        peer: String(ME),
        sender: String(ME),
        kind: 'enter',
        entry: 'assigned',
      },
    ]);
    expect(api.journal).toEqual([]);
    expect(logger.records).toEqual([]);
  });
});

describe('TelegramUpdates — вход, которого нет в таблице, в узле бесед', () => {
  /** Узел бесед учебного приложения и приём апдейтов на одном подставном порту. */
  const node = (
    entryPoints: readonly (typeof ENTRY_POINTS)[number][] = ENTRY_POINTS,
  ) => {
    const api = new MemoryBotApi();
    const bus = new AwaitingBus();
    const logger = new MemoryLogger();
    const example = new ExampleApp(
      { mode: 'test', dataDir: tmp().path, users: [A] },
      { bus, logger, clock: () => T0 },
    );
    const messenger = new TelegramMessenger({ api, logger });
    const conversations = new Conversations({
      app: ExampleDialogUiAppDef,
      codes: exampleCodes({}, ExampleDialogUiAppDef),
      server: new UiServer({
        set: ExampleUiSetDef,
        dispatch: new ApiAppDispatch(example.api),
        context: { bus, logger },
      }),
      views: exampleDialogViews(ExampleDialogUiAppDef),
      observer: new MemoryUiObserver(),
      messenger,
      store: new MemoryConversationStore(),
      logger,
      people: async (sender) => (sender === String(ME) ? A : undefined),
      peers: async (uuid) => (uuid === A ? String(ME) : undefined),
      callers: example.callers,
      places: {
        place: async () => ({ locale: 'ru-RU', timeZone: 'Asia/Oral' }),
      },
    });
    const updates = new TelegramUpdates({
      conversations,
      messenger,
      logger,
      entryPoints,
      bot: BOT,
    });
    /** Апдейт `/команда` в узел бесед; ждёт, пока беседа ответит. */
    const say = async (command: string) => {
      await updates.receive(new TestUpdates().text(ME, command));
      await conversations.settled();
    };
    return { api, conversations, say };
  };

  const NO_ENTRY = 'Такого входа нет.';

  test('/nope — имени нет в таблице: беседа отвечает «Такого входа нет.» одним сообщением', async () => {
    const { api, conversations, say } = node();

    await say('/nope');
    await conversations.close();

    expect(api.chat(ME).map((line) => line.text)).toEqual([NO_ENTRY]);
  });

  test('/start без точки start в таблице — «Такого входа нет.», а не вход start', async () => {
    const { api, conversations, say } = node([
      { entry: 'assigned', via: 'command', key: 'assigned' },
    ]);

    await say('/start');
    await conversations.close();

    expect(api.chat(ME).map((line) => line.text)).toEqual([NO_ENTRY]);
  });

  test('/tasks по таблице открывает вход start: ответ — не «Такого входа нет.»', async () => {
    const { api, conversations, say } = node();

    await say('/tasks');
    await conversations.close();

    const lines = api.chat(ME);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.map((line) => line.text)).not.toContain(NO_ENTRY);
  });
});

// Сообщество: сигнал сообщества уходит в `communities.receive`
// (отсев повторов и очередь — в `Communities`, `chat-ui`); эхо бота и апдейты
// группы без порта сообщества — ничего, без записи; отказ апдейта и бросок
// порта сообщества — запись без данных группы и участников (ERR-07).

/** Приём апдейтов с портом сообщества, который пишет сигналы. */
const withCommunities = (
  receive?: (signal: CommunitySignal) => Promise<void>,
) => {
  const received: CommunitySignal[] = [];
  const scene = setup(undefined, ENTRY_POINTS, {
    receive:
      receive ??
      (async (signal) => {
        received.push(signal);
      }),
  });
  return { ...scene, received };
};

describe('TelegramUpdates — сообщество', () => {
  test('вступление, выход, добавление бота, удаление бота и заявка уходят в communities.receive сигналами по порядку; узел бесед не вызван', async () => {
    const { received, signals, updates, api, logger } = withCommunities();
    const builder = new TestUpdates();

    await updates.receive(builder.joined(GROUP, NEWBIE, ADMIN));
    await updates.receive(builder.left(GROUP, NEWBIE, ADMIN));
    await updates.receive(builder.botAdded(GROUP, ADMIN));
    await updates.receive(builder.botRemoved(GROUP, ADMIN));
    await updates.receive(builder.joinRequest(GROUP, NEWBIE));

    expect(received).toEqual([
      {
        id: '1',
        kind: 'joined',
        community: String(GROUP),
        member: String(NEWBIE),
      },
      {
        id: '2',
        kind: 'left',
        community: String(GROUP),
        member: String(NEWBIE),
      },
      {
        id: '3',
        kind: 'added',
        community: String(GROUP),
        member: String(ADMIN),
      },
      {
        id: '4',
        kind: 'removed',
        community: String(GROUP),
        member: String(ADMIN),
      },
      {
        id: '5',
        kind: 'requested',
        community: String(GROUP),
        member: String(NEWBIE),
      },
    ]);
    expect(signals).toEqual([]);
    expect(api.journal).toEqual([]);
    expect(logger.records).toEqual([]);
  });

  test('my_chat_member не про бота проекта — сигнала нет, один error без id', async () => {
    const { received, updates, logger } = withCommunities();
    const added = new TestUpdates().botAdded(GROUP, ADMIN);
    const member = added.my_chat_member.new_chat_member;
    const update = {
      ...added,
      my_chat_member: {
        ...added.my_chat_member,
        new_chat_member: { ...member, user: { ...member.user, id: NEWBIE } },
      },
    };

    await updates.receive(update);

    expect(received).toEqual([]);
    expect(logger.records.map((record) => record.level)).toEqual(['error']);
    expect(logger.records[0]?.meta).toEqual({
      messenger: 'telegram',
      reason: 'bot',
    });
    clean(logger);
  });

  test('сообщение и команда в группе — порт сообщества не вызван, узел бесед не вызван, записей нет', async () => {
    const { received, signals, updates, logger, api } = withCommunities();
    const builder = new TestUpdates();

    await updates.receive(builder.groupText(GROUP, NEWBIE, 'Хлеб'));
    await updates.receive(builder.groupText(GROUP, NEWBIE, '/start@bot'));

    expect(received).toEqual([]);
    expect(signals).toEqual([]);
    expect(api.journal).toEqual([]);
    expect(logger.records).toEqual([]);
  });

  test('communities не передан — апдейты группы ничего: узел бесед не вызван, порт не вызван, записей нет', async () => {
    const { signals, updates, logger, api } = setup();
    const builder = new TestUpdates();

    await updates.receive(builder.joined(GROUP, NEWBIE, ADMIN));
    await updates.receive(builder.botAdded(GROUP, ADMIN));
    await updates.receive(builder.joinRequest(GROUP, NEWBIE));

    expect(signals).toEqual([]);
    expect(api.journal).toEqual([]);
    expect(logger.records).toEqual([]);
  });

  test('communities.receive бросает — receive не бросает, error с видом сигнала и именем ошибки без её текста', async () => {
    const { updates, logger } = withCommunities(async () => {
      throw new RangeError(`сбой ${SECRET_TEXT}`);
    });

    await expect(
      updates.receive(new TestUpdates().joinRequest(GROUP, NEWBIE)),
    ).resolves.toBeUndefined();

    const errors = logger.records.filter((record) => record.level === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.source).toBe('tg-bot');
    expect(errors[0]?.meta).toMatchObject({
      signal: 'requested',
      name: 'RangeError',
    });
    clean(logger);
  });

  test('апдейт группы не по схеме — порт не вызван, один warn с причиной и видом апдейта, без данных', async () => {
    const { received, updates, logger } = withCommunities();
    const update = {
      update_id: 301,
      chat_member: {
        chat: chat(GROUP, 'supergroup'),
        from: user(ADMIN),
        date: 1,
        old_chat_member: { user: user(NEWBIE), status: 'restricted' },
        new_chat_member: { user: user(NEWBIE), status: 'member' },
      },
    };

    await expect(updates.receive(update)).resolves.toBeUndefined();

    expect(received).toEqual([]);
    expect(logger.records).toHaveLength(1);
    expect(logger.records[0]).toMatchObject({
      level: 'warn',
      source: 'tg-bot',
      meta: { reason: 'schema', update: 'chat_member' },
    });
    clean(logger);
  });

  test('заявка в канал — порт не вызван, один warn с причиной chat и видом апдейта, без данных', async () => {
    const { received, updates, logger } = withCommunities();
    const asChannel = {
      update_id: 303,
      chat_join_request: {
        chat: chat(GROUP, 'channel'),
        from: user(NEWBIE),
        user_chat_id: NEWBIE,
        date: 1,
      },
    };

    await updates.receive(asChannel);

    expect(received).toEqual([]);
    expect(logger.records).toHaveLength(1);
    expect(logger.records[0]).toMatchObject({
      level: 'warn',
      meta: { reason: 'chat', update: 'chat_join_request' },
    });
    clean(logger);
  });

  test('блокировка бота в личном чате — порт сообщества не вызван, записей нет', async () => {
    const { received, updates, logger } = withCommunities();

    await updates.receive({
      update_id: 302,
      my_chat_member: {
        chat: chat(ME),
        from: user(ME),
        date: 1,
        old_chat_member: { user: user(BOT), status: 'member' },
        new_chat_member: { user: user(BOT), status: 'kicked' },
      },
    });

    expect(received).toEqual([]);
    expect(logger.records).toEqual([]);
  });

  test('сообщение и нажатие личного чата по-прежнему идут в узел бесед, порт сообщества не вызван', async () => {
    const { received, signals, updates } = withCommunities();

    await updates.receive(text());
    await updates.receive(press());

    expect(signals.map((signal) => signal.kind)).toEqual(['text', 'press']);
    expect(received).toEqual([]);
  });

  test('bot неверный — бросок сборки приёма: 0, отрицательный, дробный', () => {
    for (const bot of [0, -5, 1.5]) {
      expect(
        () =>
          new TelegramUpdates({
            conversations: { receive: async () => undefined },
            messenger: new TelegramMessenger({
              api: new MemoryBotApi(),
              logger: new MemoryLogger(),
            }),
            logger: new MemoryLogger(),
            entryPoints: ENTRY_POINTS,
            bot,
          }),
      ).toThrow();
    }
  });
});
