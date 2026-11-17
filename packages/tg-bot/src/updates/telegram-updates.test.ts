import { describe, expect, test } from 'bun:test';
import { MemoryLogger } from 'dmg-core/testing';
import type { ConversationSignal } from 'dmg-ui/chat-ui';
import { MemoryBotApi } from '../../testing';
import { TelegramMessenger } from '../messenger/telegram-messenger';
import { TelegramUpdates } from './telegram-updates';

// Приём апдейтов Telegram: сигнал беседы уходит в узел бесед; отвергнутое
// нажатие получает ровно один ответ без текста через мессенджер, сигнала
// нет; апдейт вне диалога — ничего, без записи; апдейт не по схеме — `warn`
// без данных. `receive` не бросает. Перевод апдейта в сигнал по видам —
// `telegram-signals.test.ts`; здесь — что уходит в узел бесед, в порт и в лог.

const ME = 7350001234;
const OTHER = 7350009999;
const GROUP = -1004001234567;
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
const setup = (receive?: Receiver) => {
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
  const updates = new TelegramUpdates({ conversations, messenger, logger });
  return { api, logger, signals, updates };
};

/** Запись лога не содержит ни одного из значений собеседника. */
const clean = (logger: MemoryLogger) => {
  const json = JSON.stringify(logger.records);
  for (const value of [
    String(ME),
    String(OTHER),
    String(GROUP),
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

  test.each([
    'edited_message',
    'channel_post',
    'my_chat_member',
    'chat_member',
    'chat_join_request',
  ])(
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
