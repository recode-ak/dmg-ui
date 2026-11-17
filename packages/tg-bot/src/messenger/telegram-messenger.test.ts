import { describe, expect, test } from 'bun:test';
import { err, ok } from 'dmg-core';
import {
  AwaitingBus,
  MemoryLogger,
  testUuid,
  useTempDir,
} from 'dmg-core/testing';
import { ExampleApp } from 'dmg-core/testing/example';
import {
  type ChatViews,
  Conversations,
  type FormattedText,
  MemoryConversationStore,
  type Message,
  type MessageOption,
  MessengerCapabilitiesSchema,
  type MessengerPort,
  ScreenPresenter,
  TextBuilder,
} from 'dmg-ui/chat-ui';
import {
  ExampleDialogAppDef,
  exampleDialogViews,
} from 'dmg-ui/chat-ui/testing';
import { ApiAppDispatch, UiServer } from 'dmg-ui/server';
import {
  ExampleUiSetDef,
  exampleCodes,
  MemoryUiObserver,
  TaskListScreenDef,
} from 'dmg-ui/testing';
import { T0 } from 'dmg-ui/testing/fixtures';
import * as v from 'valibot';
import { MemoryBotApi } from '../../testing';
import type { BotApi } from '../bot-api/bot-api.types';
import { TELEGRAM_CAPABILITIES, TELEGRAM_TEXTS } from './telegram.const';
import { TelegramMessenger } from './telegram-messenger';

// Мессенджер Telegram поверх порта Bot API: показ и уведомление —
// `sendMessage`, правка на месте с откатом новым сообщением, уход экрана —
// снятие клавиатуры или строка выбора, ответ на нажатие. Собеседник — только
// целое положительное число (личный чат), `callback_data` — не длиннее 64
// байт: иначе отказ без вызова API. Отказ Bot API — значение, бросок порта —
// недоставка и `error` с именем ошибки; методы не бросают, лог без данных.
// Отказы задаёт подставной порт (`failNext`, `throwNext`). Страж лимитов и
// беседа — `chat-ui`: здесь одна сквозная сцена через узел бесед.

const PEER = '42';
const CHAT = 42;
const A = testUuid(1);
const tmp = useTempDir('dmg-ui-telegram-messenger-');

const message = (
  text: string | FormattedText,
  options: readonly MessageOption[] = [],
): Message => ({
  kind: 'text',
  text: typeof text === 'string' ? TextBuilder.of(text) : text,
  options,
});

const OPTIONS: readonly MessageOption[] = [
  { ref: 'r1', label: 'Сделано' },
  { ref: 'r2', label: 'Отмена' },
];

const TASK: FormattedText = [
  { text: 'Задача ', styles: [] },
  { text: 'Хлеб', styles: ['bold'] },
];

const HELLO = message('Привет');

/** Мессенджер на подставном порту с журналом и логгером в памяти. */
const setup = () => {
  const api = new MemoryBotApi();
  const logger = new MemoryLogger();
  return { api, logger, messenger: new TelegramMessenger({ api, logger }) };
};

const methods = (api: MemoryBotApi) => api.journal.map((call) => call.method);

const sends = (api: MemoryBotApi) =>
  api.journal.flatMap((call) =>
    call.method === 'sendMessage' ? [call.params] : [],
  );

const textEdits = (api: MemoryBotApi) =>
  api.journal.flatMap((call) =>
    call.method === 'editMessageText' ? [call.params] : [],
  );

const markupEdits = (api: MemoryBotApi) =>
  api.journal.flatMap((call) =>
    call.method === 'editMessageReplyMarkup' ? [call.params] : [],
  );

const answers = (api: MemoryBotApi) =>
  api.journal.flatMap((call) =>
    call.method === 'answerCallbackQuery' ? [call.params] : [],
  );

const errors = (logger: MemoryLogger) =>
  logger.records.filter((record) => record.level === 'error');

/** Порт, у которого `sendMessage` отвечает `ok` с заданным `result`: транспорту пакет не верит. */
const brokenResult = (result: unknown): BotApi => {
  const api = new MemoryBotApi();
  return {
    sendMessage: async () => ({ ok: true, result }),
    editMessageText: (params) => api.editMessageText(params),
    editMessageReplyMarkup: (params) => api.editMessageReplyMarkup(params),
    answerCallbackQuery: (params) => api.answerCallbackQuery(params),
    setMyCommands: (params) => api.setMyCommands(params),
  };
};

describe('TelegramMessenger — показ и уведомление', () => {
  test('show — sendMessage в чат числом, текст и сущности, предпросмотр ссылок выключен; handle — message_id строкой', async () => {
    const { api, messenger } = setup();

    expect(await messenger.show(PEER, message(TASK))).toEqual(ok('1'));
    expect(await messenger.show(PEER, HELLO)).toEqual(ok('2'));
    expect(sends(api)[0]).toMatchObject({
      chat_id: CHAT,
      text: 'Задача Хлеб',
      entities: [{ type: 'bold', offset: 7, length: 4 }],
      link_preview_options: { is_disabled: true },
    });
    expect(typeof sends(api)[0]?.chat_id).toBe('number');
  });

  test('notify — тоже sendMessage с выключенным предпросмотром; handle — message_id строкой', async () => {
    const { api, messenger } = setup();

    expect(await messenger.notify(PEER, message(TASK, OPTIONS))).toEqual(
      ok('1'),
    );
    expect(methods(api)).toEqual(['sendMessage']);
    expect(sends(api)[0]).toMatchObject({
      chat_id: CHAT,
      text: 'Задача Хлеб',
      link_preview_options: { is_disabled: true },
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Сделано', callback_data: 'r1' }],
          [{ text: 'Отмена', callback_data: 'r2' }],
        ],
      },
    });
  });

  test('show с инициативой — тот же sendMessage', async () => {
    const { api, messenger } = setup();
    const port: MessengerPort = messenger;

    expect(await port.show(PEER, HELLO, { initiative: true })).toEqual(ok('1'));
    expect(methods(api)).toEqual(['sendMessage']);
  });
});

describe('TelegramMessenger — клавиатура', () => {
  test('варианты — по кнопке в строке: text — подпись, callback_data — ссылка', async () => {
    const { api, messenger } = setup();

    await messenger.show(PEER, message(TASK, OPTIONS));

    expect(api.chat(CHAT)[0]?.keyboard).toEqual([
      [{ text: 'Сделано', callback_data: 'r1' }],
      [{ text: 'Отмена', callback_data: 'r2' }],
    ]);
  });

  test('show без вариантов — без reply_markup', async () => {
    const { api, messenger } = setup();

    await messenger.show(PEER, HELLO);

    expect(sends(api)[0]?.reply_markup).toBeUndefined();
  });

  test('update без вариантов — явная пустая клавиатура', async () => {
    const { api, messenger } = setup();
    await messenger.show(PEER, message(TASK, OPTIONS));

    await messenger.update(PEER, '1', HELLO);

    expect(textEdits(api)[0]?.reply_markup).toEqual({ inline_keyboard: [] });
    expect(api.chat(CHAT)[0]?.keyboard).toEqual([]);
  });

  test.each([
    ['65 знаков ASCII', 'a'.repeat(65)],
    ['33 кириллических знака — 66 байт', 'я'.repeat(33)],
  ])(
    'callback_data длиннее 64 байт (%s) — rejected, API не вызван, error без ссылки',
    async (_name, ref) => {
      const { api, logger, messenger } = setup();
      const long = message('Выбор', [{ ref, label: 'Да' }]);

      expect(await messenger.show(PEER, long)).toEqual(
        err({ reason: 'rejected' }),
      );
      expect(await messenger.notify(PEER, long)).toEqual(
        err({ reason: 'rejected' }),
      );
      expect(await messenger.update(PEER, '1', long)).toEqual(
        err({ reason: 'rejected' }),
      );
      expect(api.journal).toEqual([]);
      expect(errors(logger)).toHaveLength(3);
      for (const record of errors(logger)) {
        expect(record.source).toBe('tg-bot');
      }
      expect(JSON.stringify(logger.records)).not.toContain(ref);
    },
  );

  test.each([
    ['64 знака ASCII', 'a'.repeat(64)],
    ['32 кириллических знака — 64 байта', 'я'.repeat(32)],
  ])('callback_data ровно 64 байта (%s) — отправлено', async (_name, ref) => {
    const { api, messenger } = setup();

    expect(
      await messenger.show(PEER, message('Выбор', [{ ref, label: 'Да' }])),
    ).toEqual(ok('1'));
    expect(api.chat(CHAT)[0]?.keyboard).toEqual([
      [{ text: 'Да', callback_data: ref }],
    ]);
  });
});

describe('TelegramMessenger — собеседник', () => {
  test.each([
    '-1001234567890',
    '-42',
    '@chan',
    '1.5',
    '',
    '0',
    ' 42',
    '42 ',
    '+42',
    '042',
    '1e3',
    '0x2A',
    '9007199254740993',
  ])(
    'peer «%s» не целое положительное — show rejected, API не вызван, error',
    async (peer) => {
      const { api, logger, messenger } = setup();

      expect(await messenger.show(peer, HELLO)).toEqual(
        err({ reason: 'rejected' }),
      );
      expect(api.journal).toEqual([]);
      expect(errors(logger)).toHaveLength(1);
      expect(errors(logger)[0]?.source).toBe('tg-bot');
    },
  );

  test('peer канала — update, retire и notify тоже rejected без вызова API', async () => {
    const { api, messenger } = setup();
    const rejected = err({ reason: 'rejected' as const });

    expect(await messenger.update('@chan', '1', HELLO)).toEqual(rejected);
    expect(await messenger.retire('@chan', '1', HELLO)).toEqual(rejected);
    expect(
      await messenger.retire('@chan', '1', message(TASK, OPTIONS), 'r1'),
    ).toEqual(rejected);
    expect(await messenger.notify('@chan', HELLO)).toEqual(rejected);
    expect(api.journal).toEqual([]);
  });

  test('наибольшее безопасное целое — допустимый собеседник', async () => {
    const { api, messenger } = setup();

    expect(await messenger.show('9007199254740991', HELLO)).toEqual(ok('1'));
    expect(sends(api)[0]?.chat_id).toBe(9007199254740991);
  });

  test('answer не смотрит на peer: ответ на нажатие уходит и при peer не личного чата', async () => {
    const { api, messenger } = setup();

    expect(await messenger.answer('@chan', 'q1')).toEqual(ok());
    expect(answers(api)).toEqual([{ callback_query_id: 'q1' }]);
  });
});

describe('TelegramMessenger — правка', () => {
  test('update — editMessageText того же message_id с текстом, сущностями и клавиатурой; edited: true, handle прежний', async () => {
    const { api, messenger } = setup();
    await messenger.show(PEER, HELLO);

    expect(await messenger.update(PEER, '1', message(TASK, OPTIONS))).toEqual(
      ok({ handle: '1', edited: true }),
    );
    expect(methods(api)).toEqual(['sendMessage', 'editMessageText']);
    expect(textEdits(api)[0]).toMatchObject({
      chat_id: CHAT,
      message_id: 1,
      text: 'Задача Хлеб',
      entities: [{ type: 'bold', offset: 7, length: 4 }],
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Сделано', callback_data: 'r1' }],
          [{ text: 'Отмена', callback_data: 'r2' }],
        ],
      },
    });
    expect(api.chat(CHAT)).toHaveLength(1);
    expect(api.chat(CHAT)[0]).toMatchObject({ text: 'Задача Хлеб', edits: 1 });
  });

  test('update тем же содержимым — «message is not modified»: ok, edited: true, sendMessage не вызван', async () => {
    const { api, messenger } = setup();
    const same = message(TASK, OPTIONS);
    await messenger.show(PEER, same);

    expect(await messenger.update(PEER, '1', same)).toEqual(
      ok({ handle: '1', edited: true }),
    );
    expect(methods(api)).toEqual(['sendMessage', 'editMessageText']);
  });

  test('update неизвестного сообщения (400) — откат: sendMessage, edited: false, новый handle', async () => {
    const { api, messenger } = setup();
    await messenger.show(PEER, HELLO);

    expect(await messenger.update(PEER, '99', message(TASK))).toEqual(
      ok({ handle: '2', edited: false }),
    );
    expect(methods(api)).toEqual([
      'sendMessage',
      'editMessageText',
      'sendMessage',
    ]);
    expect(sends(api)[1]).toMatchObject({
      chat_id: CHAT,
      text: 'Задача Хлеб',
      link_preview_options: { is_disabled: true },
    });
  });

  test("update, иной 400 («message can't be edited») — откат новым сообщением", async () => {
    const { api, messenger } = setup();
    await messenger.show(PEER, HELLO);
    api.failNext({
      error_code: 400,
      description: "Bad Request: message can't be edited",
    });

    expect(await messenger.update(PEER, '1', message(TASK))).toEqual(
      ok({ handle: '2', edited: false }),
    );
    expect(api.chat(CHAT).map((line) => line.text)).toEqual([
      'Привет',
      'Задача Хлеб',
    ]);
  });

  test.each(['abc', 'm1', '1.5', '-1', '0', ''])(
    'handle «%s» не число — сразу sendMessage, edited: false',
    async (handle) => {
      const { api, messenger } = setup();

      expect(await messenger.update(PEER, handle, HELLO)).toEqual(
        ok({ handle: '1', edited: false }),
      );
      expect(methods(api)).toEqual(['sendMessage']);
    },
  );

  test.each([
    [403, 'Forbidden: bot was blocked by the user', 'blocked'],
    [429, 'Too Many Requests: retry after 5', 'unavailable'],
    [500, 'Internal Server Error', 'unavailable'],
    [502, 'Bad Gateway', 'unavailable'],
  ] as const)(
    'update, отказ %d — недоставка %s без отката',
    async (error_code, description, reason) => {
      const { api, messenger } = setup();
      await messenger.show(PEER, HELLO);
      api.failNext({ error_code, description });

      expect(await messenger.update(PEER, '1', message(TASK))).toEqual(
        err({ reason }),
      );
      expect(methods(api)).toEqual(['sendMessage', 'editMessageText']);
    },
  );

  test('update, бросок порта — unavailable без отката', async () => {
    const { api, messenger } = setup();
    await messenger.show(PEER, HELLO);
    api.throwNext(new TypeError('сеть недоступна'));

    expect(await messenger.update(PEER, '1', message(TASK))).toEqual(
      err({ reason: 'unavailable' }),
    );
    expect(methods(api)).toEqual(['sendMessage', 'editMessageText']);
  });
});

describe('TelegramMessenger — отказы Bot API', () => {
  test('403 — blocked', async () => {
    const { api, messenger } = setup();
    api.failNext({
      error_code: 403,
      description: 'Forbidden: bot was blocked by the user',
    });

    expect(await messenger.show(PEER, HELLO)).toEqual(
      err({ reason: 'blocked' }),
    );
  });

  test('429 — unavailable, вызов один: повтора по retry_after нет', async () => {
    const { api, messenger } = setup();
    api.failNext({
      error_code: 429,
      description: 'Too Many Requests: retry after 5',
      parameters: { retry_after: 5 },
    });

    expect(await messenger.show(PEER, HELLO)).toEqual(
      err({ reason: 'unavailable' }),
    );
    expect(api.journal).toHaveLength(1);
  });

  test('400 у show — rejected', async () => {
    const { api, messenger } = setup();
    api.failNext({
      error_code: 400,
      description: 'Bad Request: message text is empty',
    });

    expect(await messenger.show(PEER, HELLO)).toEqual(
      err({ reason: 'rejected' }),
    );
    expect(api.journal).toHaveLength(1);
  });

  test('бросок порта — unavailable и error с методом и именем ошибки', async () => {
    const { api, logger, messenger } = setup();
    api.throwNext(new TypeError('сеть недоступна'));

    expect(await messenger.show(PEER, HELLO)).toEqual(
      err({ reason: 'unavailable' }),
    );
    expect(errors(logger)).toHaveLength(1);
    expect(errors(logger)[0]).toMatchObject({
      source: 'tg-bot',
      meta: { method: 'sendMessage', name: 'TypeError' },
    });
    expect(JSON.stringify(logger.records)).not.toContain('сеть недоступна');
  });

  test.each([
    ['без message_id', { chat: { id: CHAT } }],
    ['message_id строкой', { message_id: '5' }],
    ['message_id дробью', { message_id: 1.5 }],
    ['null', null],
  ])('result не по схеме (%s) — unavailable и error', async (_name, result) => {
    const logger = new MemoryLogger();
    const messenger = new TelegramMessenger({
      api: brokenResult(result),
      logger,
    });

    expect(await messenger.show(PEER, HELLO)).toEqual(
      err({ reason: 'unavailable' }),
    );
    expect(errors(logger)).toHaveLength(1);
    expect(errors(logger)[0]).toMatchObject({
      source: 'tg-bot',
      meta: { method: 'sendMessage' },
    });
  });

  test('ни один метод не бросает: при броске порта каждый возвращает unavailable', async () => {
    const unavailable = err({ reason: 'unavailable' });
    const calls: readonly ((m: TelegramMessenger) => Promise<unknown>)[] = [
      (m) => m.show(PEER, HELLO),
      (m) => m.notify(PEER, HELLO),
      (m) => m.update(PEER, '1', HELLO),
      (m) => m.retire(PEER, '1', message(TASK, OPTIONS)),
      (m) => m.retire(PEER, '1', message(TASK, OPTIONS), 'r1'),
      (m) => m.answer(PEER, 'q1', 'Готово'),
    ];

    for (const call of calls) {
      const { api, messenger } = setup();
      api.throwNext(new Error('сбой'));

      await expect(call(messenger)).resolves.toEqual(unavailable);
    }
  });
});

describe('TelegramMessenger — уход экрана', () => {
  test('retire без chosen — editMessageReplyMarkup без разметки: клавиатура снята', async () => {
    const { api, messenger } = setup();
    const shown = message(TASK, OPTIONS);
    await messenger.show(PEER, shown);

    expect(await messenger.retire(PEER, '1', shown)).toEqual(ok());
    expect(methods(api)).toEqual(['sendMessage', 'editMessageReplyMarkup']);
    expect(markupEdits(api)[0]).toMatchObject({ chat_id: CHAT, message_id: 1 });
    expect(markupEdits(api)[0]?.reply_markup).toBeUndefined();
    expect(api.chat(CHAT)[0]).toMatchObject({
      text: 'Задача Хлеб',
      keyboard: [],
    });
  });

  test('retire с chosen — editMessageText: прежний текст с сущностями и строка выбора с подписью нажатого, без клавиатуры', async () => {
    const { api, messenger } = setup();
    const shown = message(TASK, OPTIONS);
    await messenger.show(PEER, shown);

    expect(await messenger.retire(PEER, '1', shown, 'r1')).toEqual(ok());
    expect(methods(api)).toEqual(['sendMessage', 'editMessageText']);
    const line = api.chat(CHAT)[0];
    const before = 'Задача Хлеб';
    const added = line?.text.slice(before.length) ?? '';
    expect(line?.text.startsWith(before)).toBe(true);
    expect(added.startsWith('\n')).toBe(true);
    expect(added).toContain(TELEGRAM_TEXTS.chosen);
    expect(added.endsWith('Сделано')).toBe(true);
    expect(added).not.toContain('Отмена');
    expect(line?.entities).toContainEqual({
      type: 'bold',
      offset: 7,
      length: 4,
    });
    expect(line?.keyboard).toEqual([]);
    expect(line?.edits).toBe(1);
  });

  test('retire с chosen, строка выбора не влезает в 4096 — только снятие клавиатуры', async () => {
    const { api, messenger } = setup();
    const full = message('x'.repeat(4096), OPTIONS);
    await messenger.show(PEER, full);

    expect(await messenger.retire(PEER, '1', full, 'r1')).toEqual(ok());
    expect(methods(api)).toEqual(['sendMessage', 'editMessageReplyMarkup']);
    expect(api.chat(CHAT)[0]).toMatchObject({
      text: 'x'.repeat(4096),
      keyboard: [],
    });
  });

  test('повторный уход — «message is not modified»: ok у обоих видов ухода', async () => {
    const { messenger } = setup();
    const shown = message(TASK, OPTIONS);
    await messenger.show(PEER, shown);
    await messenger.show(PEER, shown);
    await messenger.retire(PEER, '1', shown);
    await messenger.retire(PEER, '2', shown, 'r2');

    expect(await messenger.retire(PEER, '1', shown)).toEqual(ok());
    expect(await messenger.retire(PEER, '2', shown, 'r2')).toEqual(ok());
  });

  test('retire неизвестного сообщения (иной 400) — rejected', async () => {
    const { messenger } = setup();

    expect(await messenger.retire(PEER, '99', message(TASK, OPTIONS))).toEqual(
      err({ reason: 'rejected' }),
    );
  });
});

describe('TelegramMessenger — ответ на нажатие', () => {
  test('answer с текстом — answerCallbackQuery с id нажатия и текстом, без show_alert', async () => {
    const { api, messenger } = setup();

    expect(await messenger.answer(PEER, 'q1', 'Готово')).toEqual(ok());
    expect(answers(api)).toEqual([{ callback_query_id: 'q1', text: 'Готово' }]);
    expect(Object.keys(answers(api)[0] ?? {}).sort()).toEqual([
      'callback_query_id',
      'text',
    ]);
  });

  test('answer без текста — без поля text', async () => {
    const { api, messenger } = setup();

    expect(await messenger.answer(PEER, 'q1')).toEqual(ok());
    expect(Object.keys(answers(api)[0] ?? {})).toEqual(['callback_query_id']);
  });

  test('400 («query is too old») — rejected, не бросок', async () => {
    const { api, messenger } = setup();
    api.failNext({
      error_code: 400,
      description: 'Bad Request: query is too old and response timeout expired',
    });

    expect(await messenger.answer(PEER, 'q1', 'Готово')).toEqual(
      err({ reason: 'rejected' }),
    );
  });
});

describe('TelegramMessenger — строки как есть, пустой текст', () => {
  const MARKS = '*_[]()~`>#+-=|{}.!\\<&';

  test('знаки разметки уходят как есть; parse_mode нет ни в одном вызове', async () => {
    const { api, messenger } = setup();
    const marked = message(
      [
        { text: MARKS, styles: [] },
        { text: MARKS, styles: ['bold'] },
      ],
      [{ ref: 'r1', label: MARKS }],
    );

    await messenger.show(PEER, marked);
    await messenger.notify(PEER, marked);
    await messenger.update(PEER, '1', message(MARKS, OPTIONS));
    await messenger.update(PEER, '99', marked);
    await messenger.retire(PEER, '2', marked);
    await messenger.retire(PEER, '1', message(MARKS, OPTIONS), 'r1');
    await messenger.answer(PEER, 'q1', MARKS);

    expect(sends(api)[0]?.text).toBe(MARKS + MARKS);
    expect(api.chat(CHAT)[1]?.keyboard).toEqual([]);
    expect(methods(api)).toEqual([
      'sendMessage',
      'sendMessage',
      'editMessageText',
      'editMessageText',
      'sendMessage',
      'editMessageReplyMarkup',
      'editMessageText',
      'answerCallbackQuery',
    ]);
    for (const call of api.journal) {
      expect(Object.keys(call.params)).not.toContain('parse_mode');
    }
  });

  test.each([
    ['без фрагментов', []],
    ['пустой фрагмент', [{ text: '', styles: [] }]],
    ['одни пробелы со стилем', [{ text: '  \n\t ', styles: ['bold'] }]],
  ] as const)(
    'текст пуст (%s), варианты есть — заглушка без сущностей, клавиатура на месте',
    async (_name, text) => {
      const { api, messenger } = setup();
      const blank = message(text, OPTIONS);

      await messenger.show(PEER, blank);
      await messenger.notify(PEER, blank);
      await messenger.update(PEER, '1', blank);

      const texts = [...sends(api), ...textEdits(api)];
      expect(texts).toHaveLength(3);
      for (const params of texts) {
        expect(params.text).toBe(TELEGRAM_TEXTS.empty);
        expect(params.entities ?? []).toEqual([]);
        expect(params.reply_markup?.inline_keyboard).toHaveLength(2);
      }
    },
  );
});

describe('TelegramMessenger — возможности', () => {
  test('TELEGRAM_CAPABILITIES — значения Telegram', () => {
    expect(TELEGRAM_CAPABILITIES).toStrictEqual({
      name: 'telegram',
      kinds: ['text'],
      edit: true,
      text: { max: 4096, unit: 'utf16' },
      textWithOptions: { max: 4096, unit: 'utf16' },
      options: { max: 100, label: { max: 64, unit: 'utf16' }, ref: 64 },
      pressAnswer: { max: 200, unit: 'utf16' },
      form: false,
      initiative: { kind: 'afterContact' },
      community: {
        signals: ['joined', 'left', 'added', 'removed', 'requested'],
        operations: ['exclude', 'approve'],
      },
    });
  });

  test('проходят MessengerCapabilitiesSchema без потерь', () => {
    const parsed = v.safeParse(
      MessengerCapabilitiesSchema,
      TELEGRAM_CAPABILITIES,
    );

    expect(parsed.success).toBe(true);
    expect(parsed.output).toEqual(TELEGRAM_CAPABILITIES);
  });

  test('возможности мессенджера — TELEGRAM_CAPABILITIES', () => {
    expect(setup().messenger.capabilities).toBe(TELEGRAM_CAPABILITIES);
  });
});

describe('TelegramMessenger — лог без данных', () => {
  test('ни одна запись не содержит id чата, message_id, id нажатия, текста, подписи, callback_data и текста броска', async () => {
    const peer = '777000123';
    const text = 'секретный-текст-q9';
    const longRef = `long${'q'.repeat(70)}`;
    const secrets = [
      peer,
      text,
      'подпись-q9',
      'refq9secret',
      'press-q9-555',
      'ошибка-q9',
      longRef,
      '@secret-q9-chan',
    ];
    const { api, logger, messenger } = setup();
    const shown = message(`Привет, ${text}`, [
      { ref: 'refq9secret', label: 'подпись-q9' },
    ]);
    const handles: string[] = [];
    for (const delivery of [
      await messenger.show(peer, shown),
      await messenger.notify(peer, shown),
    ]) {
      if (delivery.ok) handles.push(delivery.value);
    }

    await messenger.update(peer, '1', shown);
    api.failNext({ error_code: 400, description: 'Bad Request: x' });
    await messenger.update(peer, '2', shown);
    api.failNext({ error_code: 403, description: 'Forbidden: y' });
    await messenger.update(peer, '1', shown);
    await messenger.retire(peer, '1', shown, 'refq9secret');
    await messenger.retire(peer, '404', shown);
    await messenger.answer(peer, 'press-q9-555', text);
    api.failNext({ error_code: 400, description: 'Bad Request: z' });
    await messenger.answer(peer, 'press-q9-555');
    api.throwNext(new TypeError('ошибка-q9 777000123'));
    await messenger.notify(peer, shown);
    api.throwNext(new Error('ошибка-q9'));
    await messenger.answer(peer, 'press-q9-555');
    await messenger.show('@secret-q9-chan', shown);
    await messenger.show(
      peer,
      message('x', [{ ref: longRef, label: 'подпись-q9' }]),
    );
    const broken = new MemoryLogger();
    await new TelegramMessenger({
      api: brokenResult({ chat: { id: 777000123 } }),
      logger: broken,
    }).show(peer, shown);
    const records = [...logger.records, ...broken.records];
    const json = JSON.stringify(records);

    expect(handles).toEqual(['1', '2']);
    expect(errors(logger).length).toBeGreaterThan(0);
    expect(errors(broken)).toHaveLength(1);
    for (const secret of secrets) {
      expect(json).not.toContain(secret);
    }
    const metaValues = records.flatMap((record) =>
      Object.values(record.meta ?? {}),
    );
    for (const handle of handles) {
      expect(metaValues).not.toContain(handle);
      expect(metaValues).not.toContain(Number(handle));
    }
  });

  test('отказ Bot API — warn с методом, кодом и описанием сервера не длиннее 200 знаков', async () => {
    const { api, logger, messenger } = setup();
    const description = `Bad Request: ${'d'.repeat(300)}`;
    api.failNext({ error_code: 400, description });

    await messenger.show(PEER, HELLO);

    expect(logger.records).toHaveLength(1);
    expect(logger.records[0]).toMatchObject({
      level: 'warn',
      source: 'tg-bot',
      meta: {
        method: 'sendMessage',
        error_code: 400,
        description: description.slice(0, 200),
      },
    });
  });
});

describe('TelegramMessenger — в узле бесед', () => {
  /** Узел бесед учебного приложения с мессенджером Telegram; собеседник и отправитель — `PEER`. */
  const node = (api: MemoryBotApi, views: ChatViews = exampleDialogViews) => {
    const bus = new AwaitingBus();
    const logger = new MemoryLogger();
    const example = new ExampleApp(
      { mode: 'test', dataDir: tmp().path, users: [A] },
      { bus, logger, clock: () => T0 },
    );
    const server = new UiServer({
      set: ExampleUiSetDef,
      dispatch: new ApiAppDispatch(example.api),
      context: { bus, logger },
    });
    return new Conversations({
      app: ExampleDialogAppDef,
      codes: exampleCodes(),
      server,
      views,
      observer: new MemoryUiObserver(),
      messenger: new TelegramMessenger({ api, logger }),
      store: new MemoryConversationStore(),
      logger,
      people: async (sender) => (sender === PEER ? A : undefined),
      peers: async (uuid) => (uuid === A ? PEER : undefined),
      callers: example.callers,
      places: {
        place: async () => ({ locale: 'ru-RU', timeZone: 'Asia/Oral' }),
      },
    });
  };

  test('текст экрана 5000 UTF-16 приходит в sendMessage обрезанным стражем до 4096', async () => {
    const api = new MemoryBotApi();
    const long = exampleDialogViews.over([
      ScreenPresenter.of(TaskListScreenDef, {
        render: (_view, kit) => kit.message('ж'.repeat(5000)),
      }),
    ]);
    const conversations = node(api, long);

    await conversations.receive({
      id: '1',
      peer: PEER,
      sender: PEER,
      kind: 'enter',
      entry: 'start',
    });
    await conversations.close();

    expect(methods(api)).toEqual(['sendMessage']);
    expect(sends(api)[0]?.chat_id).toBe(CHAT);
    expect(sends(api)[0]?.text).toHaveLength(4096);
    expect(sends(api)[0]?.text.startsWith('жжж')).toBe(true);
  });
});
