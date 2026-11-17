import { describe, expect, test } from 'bun:test';
import {
  AwaitingBus,
  MemoryLogger,
  testUuid,
  useTempDir,
} from 'dmg-core/testing';
import { ExampleApp } from 'dmg-core/testing/example';
import { Conversations, MemoryConversationStore } from 'dmg-ui/chat-ui';
import {
  ExampleDialogAppDef,
  exampleDialogViews,
} from 'dmg-ui/chat-ui/testing';
import {
  ApiAppDispatch,
  type PersonPlaces,
  UiNotifier,
  UiServer,
} from 'dmg-ui/server';
import {
  ExampleUiSetDef,
  exampleCodes,
  MemoryUiObserver,
  TaskAssignedNotificationDef,
  TaskCompletedNotificationDef,
} from 'dmg-ui/testing';
import { oplogRecords, T0 } from 'dmg-ui/testing/fixtures';
import {
  type InlineKeyboardMarkup,
  type MessageEntity,
  TelegramMessenger,
  TelegramUpdates,
} from 'dmg-ui/tg-bot';
import * as v from 'valibot';
import {
  type BotApiCall,
  type BotChatLine,
  MemoryBotApi,
  TestUpdates,
} from '.';

// Сторис на Telegram: шаги учебной сторис беседы (пользователи A и B,
// задачи, поручение, уведомления) идут апдейтами Bot API через
// `TelegramUpdates` в узел бесед с `TelegramMessenger` на подставном порту.
// Проверки — в терминах Telegram: кнопки и `callback_data`, правка на месте,
// ответ на нажатие, уведомление, ушедший экран. Лог операций домена здесь
// не перепроверяется — это делает сторис `chat-ui`; здесь — только то, что
// id Telegram в него не попадают. Перезапуск — новый узел бесед и новый
// приём апдейтов на том же хранилище и том же подставном порту.

const A = testUuid(1);
const B = testUuid(2);
/** id Telegram — длинные, чтобы не совпасть случайно с uuid и временем. */
const CHAT_A = 7350001234;
const CHAT_B = 7350005678;
const TITLE = 'Сыр *острый* _[1](x)_ <b>&';
const CHOSEN = 'Вы выбрали: ';
const CLOSED = 'Экран уже закрыт.';
const tmp = useTempDir('dmg-ui-telegram-story-');

const places: PersonPlaces = {
  place: async () => ({ locale: 'ru-RU', timeZone: 'Asia/Oral' }),
};

/** Кнопка живого места и сообщение, на котором она стоит. */
type Found = {
  readonly line: BotChatLine;
  readonly data: string;
};

type SentOrEdited = Extract<
  BotApiCall,
  { method: 'sendMessage' | 'editMessageText' }
>;

/** Вызовы с текстом: новое сообщение или правка текста. */
const texts = (journal: readonly BotApiCall[]): SentOrEdited[] =>
  journal.filter(
    (call): call is SentOrEdited =>
      call.method === 'sendMessage' || call.method === 'editMessageText',
  );

/** Все `callback_data` разметки вызова. */
const dataOf = (markup: InlineKeyboardMarkup | undefined): string[] =>
  (markup?.inline_keyboard ?? []).flatMap((row) =>
    row.map((button) => button.callback_data),
  );

const labelsOf = (line: BotChatLine): string[] =>
  line.keyboard.flatMap((row) => row.map((button) => button.text));

/** Каждая сущность внутри текста: смещение и длина — в его единицах UTF-16. */
const inside = (text: string, entities: readonly MessageEntity[] = []) =>
  entities.every(
    (entity) =>
      entity.offset >= 0 &&
      entity.length > 0 &&
      entity.offset + entity.length <= text.length,
  );

/** Приложение, сервер, порт Bot API и хранилище бесед; узел бесед — `node()`. */
const world = () => {
  const bus = new AwaitingBus();
  const logger = new MemoryLogger();
  const context = { bus, logger };
  const example = new ExampleApp(
    { mode: 'test', dataDir: tmp().path, users: [A, B] },
    { ...context, clock: () => T0 },
  );
  const dispatch = new ApiAppDispatch(example.api);
  const server = new UiServer({ set: ExampleUiSetDef, dispatch, context });
  const codes = exampleCodes();
  const observer = new MemoryUiObserver();
  const store = new MemoryConversationStore();
  const api = new MemoryBotApi();
  const updates = new TestUpdates();
  // Личность — `String(from.id)` через `people` проекта, обратно — `peers`.
  const people = new Map([
    [String(CHAT_A), A],
    [String(CHAT_B), B],
  ]);
  const peerOf = new Map([
    [A, String(CHAT_A)],
    [B, String(CHAT_B)],
  ]);
  // Эпохи ссылок — одна последовательность на мир: узел после перезапуска
  // берёт следующие, как случайные.
  let epoch = 0;
  /** id нажатий по порядку отправки апдейтов. */
  const presses: string[] = [];

  /** Узел бесед и приём апдейтов; новый на том же хранилище и порту — «перезапуск». */
  const node = () => {
    const messenger = new TelegramMessenger({ api, logger });
    const conversations = new Conversations({
      app: ExampleDialogAppDef,
      codes,
      server,
      views: exampleDialogViews,
      observer,
      messenger,
      store,
      logger,
      people: async (sender) => people.get(sender),
      peers: async (uuid) => peerOf.get(uuid),
      callers: example.callers,
      places,
      epochs: () => {
        epoch += 1;
        return `e${String(epoch).padStart(4, '0')}`;
      },
    });
    const telegram = new TelegramUpdates({ conversations, messenger, logger });
    return { conversations, telegram };
  };

  let current = node();

  /** Уведомления уходят в беседу получателя: доставка — узел бесед. */
  const notifications = () =>
    new UiNotifier({
      app: ExampleDialogAppDef,
      codes,
      dispatch,
      callers: example.callers,
      delivery: current.conversations,
      observer,
      context,
    }).start();

  /** Прежний узел закрыт, новый собран на том же хранилище и порту. */
  const restart = async () => {
    await current.conversations.close();
    current = node();
  };

  const settle = async () => {
    await bus.delivered();
    await current.conversations.settled();
  };

  const person = (chat: number) => {
    const lines = () => api.chat(chat);
    /** Живое место — последнее сообщение чата с клавиатурой. */
    const place = (): BotChatLine => {
      const line = lines().findLast((l) => l.keyboard.length > 0);
      if (line === undefined) throw new Error('живого места нет');
      return line;
    };
    const find = (label: string): Found => {
      const line = place();
      const button = line.keyboard
        .flat()
        .find((candidate) => candidate.text === label);
      if (button === undefined)
        throw new Error(`нет кнопки «${label}» в живом месте`);
      return { line, data: button.callback_data };
    };
    /** Нажатие `data` на сообщении `messageId`; возвращает id нажатия. */
    const pressData = async (data: string, messageId: number) => {
      const update = updates.press(chat, data, messageId);
      presses.push(update.callback_query.id);
      await current.telegram.receive(update);
      return update.callback_query.id;
    };
    return {
      say: (text: string) => current.telegram.receive(updates.text(chat, text)),
      lines,
      place,
      find,
      pressData,
      press: async (label: string) => {
        const found = find(label);
        await pressData(found.data, found.line.message_id);
        return found;
      },
      /** Вызовы порта в этот чат. */
      calls: () =>
        api.journal.filter(
          (call) =>
            call.method !== 'answerCallbackQuery' &&
            call.params.chat_id === chat,
        ),
    };
  };

  /** Ответы на нажатия по порядку: id нажатия и текст. */
  const answers = () =>
    api.journal.flatMap((call) =>
      call.method === 'answerCallbackQuery' ? [call.params] : [],
    );

  return {
    a: person(CHAT_A),
    b: person(CHAT_B),
    api,
    logger,
    presses,
    answers,
    notifications,
    restart,
    settle,
  };
};

type World = ReturnType<typeof world>;

/** Шаги 0–5 учебной сторис: два списка B, три задачи A, «Дальше» и «Назад». */
const firstSteps = async (w: World) => {
  const { a, b } = w;
  // 0. B открывает свой список — пусто.
  await b.say('/start');
  // 2. A: свой список, затем задача свободным текстом.
  await a.say('/start');
  await a.say('Хлеб');
  await w.settle();
  // 1. B открывает «Назначенные мне»: прежний список уходит.
  await b.say('/assigned');
  // 3. Ещё две задачи: на странице две, есть «Дальше».
  await a.say('Молоко');
  await a.say(TITLE);
  await w.settle();
};

describe('сторис на Telegram', () => {
  test('шаги сторис апдейтами: кнопки-ссылки, правка на месте, ответ на нажатие, уведомления B', async () => {
    const w = world();
    w.notifications();
    const { a, b } = w;
    await firstSteps(w);

    // Свободный текст стал задачей: A видит «Задача создана».
    expect(
      w.api.journal.some(
        (call) =>
          call.method === 'sendMessage' &&
          call.params.chat_id === CHAT_A &&
          call.params.text.includes('Задача создана'),
      ),
    ).toBe(true);
    // Ушедший список B: клавиатура снята, сообщение осталось в чате.
    const [listOfB, assignedOfB] = b.lines();
    expect(b.lines()).toHaveLength(2);
    expect(listOfB?.keyboard).toEqual([]);
    expect(assignedOfB?.keyboard.length).toBeGreaterThan(0);

    // 4. «Дальше» правит то же сообщение; повтор прежней «Дальше» — ответ
    // «Экран уже закрыт.».
    const next = await a.press('Дальше');
    expect(a.calls().at(-1)).toMatchObject({
      method: 'editMessageText',
      params: { chat_id: CHAT_A, message_id: next.line.message_id },
    });
    expect(a.place().message_id).toBe(next.line.message_id);
    expect(a.place().text).toContain(TITLE);
    const again = await a.pressData(next.data, next.line.message_id);
    expect(w.answers().at(-1)).toEqual({
      callback_query_id: again,
      text: CLOSED,
    });

    // 5–7. «Назад», выбор двух задач, «Выполнить выбранные» и «Да».
    await a.press('Назад');
    await a.press('Отметить задачу');
    await a.press('Хлеб');
    await a.press('Отметить задачу');
    await a.press('Молоко');
    await a.press('Выполнить выбранные');
    expect(labelsOf(a.place())).toEqual(expect.arrayContaining(['Да', 'Нет']));
    await a.press('Да');
    await w.settle();
    expect(labelsOf(a.place())).not.toContain('Выполнить выбранные');

    // 8. Карточка задачи со знаками разметки; «Назначить» — исполнитель B.
    await a.press('Открыть задачу');
    await a.press(TITLE);
    await a.press('Назначить');
    await a.say(B);
    await w.settle();

    // 9. У B — уведомление в его чат: `sendMessage` с кнопкой «Назначенные мне».
    const noticesOfB = () =>
      b
        .calls()
        .flatMap((call) => (call.method === 'sendMessage' ? [call.params] : []))
        .filter((params) =>
          [
            TaskAssignedNotificationDef.label,
            TaskCompletedNotificationDef.label,
          ].some((label) => params.text.startsWith(`${label}: `)),
        );
    const [assigned] = noticesOfB();
    expect(assigned?.text).toBe(
      `${TaskAssignedNotificationDef.label}: ${TITLE}`,
    );
    expect(assigned?.reply_markup?.inline_keyboard).toEqual([
      [{ text: 'Назначенные мне', callback_data: expect.any(String) }],
    ]);

    // 10. A выполняет задачу на карточке; B получает «Поручение выполнено».
    await a.press('Выполнить');
    await w.settle();
    expect(labelsOf(a.place())).not.toContain('Выполнить');
    expect(noticesOfB().map((notice) => notice.text)).toEqual([
      `${TaskAssignedNotificationDef.label}: ${TITLE}`,
      `${TaskCompletedNotificationDef.label}: ${TITLE}`,
    ]);
    for (const notice of noticesOfB()) {
      expect(
        notice.reply_markup?.inline_keyboard.flat().map((b) => b.text),
      ).toEqual(['Назначенные мне']);
    }

    // На каждое нажатие — ровно один ответ с его id.
    expect(w.answers().map((answer) => answer.callback_query_id)).toEqual(
      w.presses,
    );
  });

  test('каждая кнопка сторис несёт свою ссылку: callback_data ≤ 64 байт и не повторяется', async () => {
    const w = world();
    w.notifications();
    const { a } = w;
    await firstSteps(w);
    await a.press('Дальше');
    await a.press('Открыть задачу');
    await a.press(TITLE);
    await a.press('Назначить');
    await a.say(B);
    await w.settle();

    const shown = texts(w.api.journal);
    const data = shown.flatMap((call) => dataOf(call.params.reply_markup));
    expect(data.length).toBeGreaterThan(0);
    for (const ref of data) {
      expect(ref).toMatch(/^[a-z0-9]{1,16}$/);
      expect(new TextEncoder().encode(ref).length).toBeLessThanOrEqual(64);
    }
    // Ссылка выдаётся одной кнопке один раз: показ, правка и уведомление
    // несут свои ссылки.
    expect(new Set(data).size).toBe(data.length);
  });

  test('имя задачи со знаками разметки уходит как есть: parse_mode нет, сущности внутри текста', async () => {
    const w = world();
    const { a } = w;
    await firstSteps(w);
    await a.press('Дальше');

    const shown = texts(w.api.journal);
    expect(
      shown.some(
        (call) =>
          call.params.chat_id === CHAT_A && call.params.text.includes(TITLE),
      ),
    ).toBe(true);
    for (const call of w.api.journal) {
      expect(Object.keys(call.params)).not.toContain('parse_mode');
    }
    for (const call of shown) {
      expect(inside(call.params.text, call.params.entities)).toBe(true);
    }
    expect(a.place().text).toContain(TITLE);
  });

  test('ушедший экран после нажатия: клавиатура снята, строка выбора с подписью нажатого', async () => {
    const w = world();
    const { a } = w;
    await firstSteps(w);
    await a.press('Дальше');
    const page = a.place();

    // Сообщение нельзя править — показ новым сообщением, прежнее уходит со
    // строкой выбора нажатого.
    w.api.failNext({
      error_code: 400,
      description: "Bad Request: message can't be edited",
    });
    await a.press('Назад');

    const retired = a
      .lines()
      .find((line) => line.message_id === page.message_id);
    expect(retired?.keyboard).toEqual([]);
    expect(retired?.text).toBe(`${page.text}\n\n${CHOSEN}Назад`);
    expect(a.place().message_id).toBeGreaterThan(page.message_id);
    expect(a.place().text).toContain('Хлеб');
  });
});

describe('сторис на Telegram — перезапуск', () => {
  test('после перезапуска нажатие на прежнем экране исполнено, сообщение поправлено на месте, ссылки новые', async () => {
    const w = world();
    const { a } = w;
    await firstSteps(w);
    await a.press('Дальше');
    const before = texts(w.api.journal).flatMap((call) =>
      dataOf(call.params.reply_markup),
    );
    const back = a.find('Назад');
    const journal = w.api.journal.length;

    await w.restart();
    const id = await a.pressData(back.data, back.line.message_id);
    await w.settle();

    // Прежнее сообщение поправлено на месте: первая страница, тот же message_id.
    const after = w.api.journal.slice(journal);
    const edits = after.filter((call) => call.method === 'editMessageText');
    expect(edits.map((call) => call.params.message_id)).toEqual([
      back.line.message_id,
    ]);
    expect(
      after.filter(
        (call) =>
          call.method === 'sendMessage' && call.params.chat_id === CHAT_A,
      ),
    ).toEqual([]);
    expect(a.place().message_id).toBe(back.line.message_id);
    expect(a.place().text).toContain('Хлеб');
    expect(a.place().text).not.toContain(TITLE);
    // Нажатию — один ответ.
    expect(
      after.filter((call) => call.method === 'answerCallbackQuery'),
    ).toEqual([
      {
        method: 'answerCallbackQuery',
        params: { callback_query_id: id },
      },
    ]);
    // Новые кнопки — новые ссылки.
    const fresh = texts(after).flatMap((call) =>
      dataOf(call.params.reply_markup),
    );
    expect(fresh.length).toBeGreaterThan(0);
    expect(fresh.filter((ref) => before.includes(ref))).toEqual([]);
  });
});

const Record = v.object({
  caller: v.object({
    kind: v.string(),
    subjectId: v.optional(v.string()),
  }),
  trace: v.object({
    channel: v.optional(v.record(v.string(), v.unknown())),
  }),
});

describe('сторис на Telegram — личность непрозрачна', () => {
  test('id Telegram нет в логе операций и логгере; вызывающий — uuid, в следе канала нет visitorId', async () => {
    const w = world();
    w.notifications();
    const { a } = w;
    await firstSteps(w);
    await a.press('Дальше');
    await a.press('Открыть задачу');
    await a.press(TITLE);
    await a.press('Назначить');
    await a.say(B);
    await w.settle();

    const raw = oplogRecords(tmp().path);
    expect(raw.length).toBeGreaterThan(0);
    const dump = JSON.stringify([raw, w.logger.records]);
    for (const id of [CHAT_A, CHAT_B]) expect(dump).not.toContain(String(id));

    const records = raw.map((record) => v.parse(Record, record));
    const people = records.filter((r) => r.caller.kind !== 'system');
    expect(people.length).toBeGreaterThan(0);
    for (const record of people) {
      expect([A, B]).toContain(record.caller.subjectId ?? '');
    }
    for (const record of records) {
      expect(record.trace.channel ?? {}).not.toHaveProperty('visitorId');
    }
    expect(
      records.some(
        (r) => r.trace.channel?.name === ExampleDialogAppDef.channel,
      ),
    ).toBe(true);
  });
});
