import { describe, expect, test } from 'bun:test';
import { type DomainError, ok, type Result, Trace } from 'dmg-core';
import {
  AwaitingBus,
  MemoryLogger,
  testUuid,
  useTempDir,
} from 'dmg-core/testing';
import {
  CompleteTaskUcDef,
  CreateTaskUcDef,
  ExampleApp,
  type ExampleUser,
  ListTasksUcDef,
  TodoModuleDef,
} from 'dmg-core/testing/example';
import { type ActionSteps, Availability, ScreenCode } from 'dmg-ui';
import { Conversations, MemoryConversationStore } from 'dmg-ui/chat-ui';
import {
  ExampleDialogUiAppDef,
  exampleDialogViews,
} from 'dmg-ui/chat-ui/testing';
import {
  ApiAppDispatch,
  type PersonPlaces,
  type UcDispatch,
  UiServer,
} from 'dmg-ui/server';
import {
  type ExampleCodeOverrides,
  ExampleUiSetDef,
  exampleCodes,
  MemoryUiObserver,
  TaskCardScreenDef,
  TaskListScreenDef,
} from 'dmg-ui/testing';
import { T0 } from 'dmg-ui/testing/fixtures';
import { TelegramMessenger, TelegramUpdates } from 'dmg-ui/tg-bot';
import {
  type BotApiCall,
  type BotChatLine,
  MemoryBotApi,
  TestUpdates,
} from '.';

// Отключённое действие на Telegram: обычная кнопка с пометкой `🚫` в подписи
// (`callback_data` есть, `disabled` и `style` нет); нажатие отвечает причиной
// тостом — одним `answerCallbackQuery` с `text` без `show_alert`, без новых
// и правленых сообщений; ядро не вызывается. Предел `text` — 200 единиц
// UTF-16. Мир — учебное приложение: задачи создаются мимо беседы, апдейты
// идут через `TelegramUpdates` на подставном порту Bot API.

const A = testUuid(1);
const B = testUuid(2);
const CHAT_A = 7350001234;
const CHAT_B = 7350005678;
const BOT = 7350009000;
const ENTRY_POINTS = [
  { entry: 'start', via: 'command', key: 'start' },
  { entry: 'assigned', via: 'command', key: 'assigned' },
];
const CREATE = 'Создать задачу';
const CREATE_OFF = '🚫 Создать задачу';
/** Причина отключённого «Создать задачу» — текст ошибки предела открытых. */
const LIMIT_TEXT = 'Слишком много открытых задач';
const CLOSED = 'Эта кнопка устарела.';
const STALE = 'Экран обновился.';
const TITLES = ['Хлеб', 'Молоко', 'Сыр'];
const tmp = useTempDir('dmg-ui-telegram-disabled-');

const places: PersonPlaces = {
  place: async () => ({ locale: 'ru-RU', timeZone: 'Asia/Oral' }),
};

type List = typeof TaskListScreenDef;

/** Список, у которого «Создать задачу» отключено причиной сверх предела `answerCallbackQuery`. */
class LongReasonListCode extends ScreenCode<List, ExampleUser> {
  static readonly REASON = '😀'.repeat(120);

  override readonly locals = {
    toggle: (state: { selected: string[] }) => state,
  };

  override readonly actions: Partial<ActionSteps<List, ExampleUser>> = {
    open: { done: ({ input }) => TaskCardScreenDef.at(input) },
    create: {
      done: (_, output) =>
        TaskListScreenDef.exits.created.with({ taskId: output.taskId }),
    },
    completeSelected: {
      command: () => ({ taskIds: [] }),
      done: ({ params }) => TaskListScreenDef.at(params),
    },
    jumpTo: {
      done: ({ input }) => TaskListScreenDef.at({ page: input.part - 1 }),
    },
    next: { done: ({ params }) => TaskListScreenDef.at(params) },
    prev: { done: ({ params }) => TaskListScreenDef.at(params) },
    close: { done: () => TaskListScreenDef.exits.closed.with() },
  };

  override readonly availability = {
    create: () => Availability.disabled(LongReasonListCode.REASON),
  };

  override async load(): Promise<
    Result<
      {
        tasks: never[];
        owned: never[];
        hasMore: boolean;
        hasPrev: boolean;
      },
      DomainError
    >
  > {
    return ok({ tasks: [], owned: [], hasMore: false, hasPrev: false });
  }

  override initialState(): { selected: string[] } {
    return { selected: [] };
  }
}

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

const labelsOf = (line: BotChatLine): string[] =>
  line.keyboard.flatMap((row) => row.map((button) => button.text));

/** Приложение, сервер, порт Bot API и хранилище бесед; один узел бесед на двух людей. */
const world = (over: ExampleCodeOverrides = {}) => {
  const bus = new AwaitingBus();
  const logger = new MemoryLogger();
  const context = { bus, logger };
  const example = new ExampleApp(
    { mode: 'test', dataDir: tmp().path, users: [A, B] },
    { ...context, clock: () => T0 },
  );
  const inner = new ApiAppDispatch(example.api);
  /** Имена UC, которые дошли от беседы до приложения. */
  const calls: string[] = [];
  const dispatch: UcDispatch<ExampleUser> = {
    dispatch: async (request) => {
      calls.push(request.uc.name);
      return inner.dispatch(request);
    },
  };
  const server = new UiServer({ set: ExampleUiSetDef, dispatch, context });
  const api = new MemoryBotApi();
  const updates = new TestUpdates();
  const people = new Map([
    [String(CHAT_A), A],
    [String(CHAT_B), B],
  ]);
  const peerOf = new Map([
    [A, String(CHAT_A)],
    [B, String(CHAT_B)],
  ]);
  let epoch = 0;
  const messenger = new TelegramMessenger({ api, logger });
  const conversations = new Conversations({
    app: ExampleDialogUiAppDef,
    codes: exampleCodes(over, ExampleDialogUiAppDef),
    server,
    views: exampleDialogViews(ExampleDialogUiAppDef),
    observer: new MemoryUiObserver(),
    messenger,
    store: new MemoryConversationStore(),
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
  const telegram = new TelegramUpdates({
    conversations,
    messenger,
    logger,
    entryPoints: ENTRY_POINTS,
    bot: BOT,
  });

  const settle = async () => {
    await bus.delivered();
    await conversations.settled();
  };

  let requests = 0;
  /** Вызывающий `uuid` и след запроса мимо беседы. */
  const outside = async (uuid: string) => {
    requests += 1;
    const trace = Trace.fromRequest({ requestId: `r-outside-${requests}` });
    const caller = await example.callers.resolve(uuid, trace);
    if (!caller.ok) throw new Error('вызывающий не найден');
    return { caller: caller.value, trace };
  };

  const person = (chat: number) => {
    /** Живое место — последнее сообщение чата с нажимаемой кнопкой. */
    const place = (): BotChatLine => {
      const line = api
        .chat(chat)
        .findLast((l) =>
          l.keyboard.flat().some((button) => 'callback_data' in button),
        );
      if (line === undefined) throw new Error('живого места нет');
      return line;
    };
    return {
      say: (text: string) => telegram.receive(updates.text(chat, text)),
      place,
      /** Кнопка живого места по подписи: её данные и сообщение. */
      find: (label: string) => {
        const line = place();
        const button = line.keyboard.flat().find((one) => one.text === label);
        if (button === undefined || !('callback_data' in button)) {
          throw new Error(`нет кнопки «${label}» в живом месте`);
        }
        return { line, button, data: button.callback_data };
      },
      /** Нажатие `data` на сообщении `messageId`; возвращает id нажатия. */
      pressData: async (data: string, messageId: number) => {
        const update = updates.press(chat, data, messageId);
        await telegram.receive(update);
        return update.callback_query.id;
      },
    };
  };

  return {
    api,
    logger,
    calls,
    settle,
    bus,
    a: person(CHAT_A),
    b: person(CHAT_B),
    /** Задача владельца A создана мимо беседы; возвращает её id. */
    create: async (title: string): Promise<string> => {
      const at = await outside(A);
      const created = await example.api.dispatch(
        TodoModuleDef,
        CreateTaskUcDef.command({ title }),
        at.caller,
        at.trace,
      );
      if (!created.ok) throw new Error('createTask не исполнен');
      return created.value.taskId;
    },
    /** Задача выполнена мимо беседы: событие идёт по шине. */
    complete: async (taskId: string): Promise<void> => {
      const at = await outside(A);
      const done = await example.api.dispatch(
        TodoModuleDef,
        CompleteTaskUcDef.command({ taskId }),
        at.caller,
        at.trace,
      );
      if (!done.ok) throw new Error('completeTask не исполнен');
    },
    /** Число задач владельца A. */
    tasks: async (): Promise<number> => {
      const at = await outside(A);
      const listed = await example.api.dispatch(
        TodoModuleDef,
        ListTasksUcDef.command({}),
        at.caller,
        at.trace,
      );
      if (!listed.ok) throw new Error('listTasks не исполнен');
      return listed.value.length;
    },
    /** Ответы на нажатия по порядку: параметры `answerCallbackQuery`. */
    answers: () =>
      api.journal.flatMap((call) =>
        call.method === 'answerCallbackQuery' ? [call.params] : [],
      ),
  };
};

type World = ReturnType<typeof world>;

/** Владелец A с тремя открытыми задачами открыл список: «Создать задачу» отключено пределом. */
const limited = async (w: World = world()) => {
  const ids: string[] = [];
  for (const title of TITLES) ids.push(await w.create(title));
  await w.bus.delivered();
  await w.a.say('/start');
  await w.settle();
  return { ...w, ids };
};

describe('Telegram — отключённое действие', () => {
  test('кнопка «🚫 Создать задачу» обычная: callback_data есть, disabled и style нет; обычной «Создать задачу» нет', async () => {
    const w = await limited();

    const { button, line } = w.a.find(CREATE_OFF);

    expect(button).toHaveProperty('callback_data');
    expect(button).not.toHaveProperty('disabled');
    expect(button).not.toHaveProperty('style');
    expect(labelsOf(line)).not.toContain(CREATE);
  });

  test('нажатие — ровно один answerCallbackQuery с причиной без show_alert; сообщений нет, экран прежний, UC не вызван, задач три', async () => {
    const w = await limited();
    const { data, line } = w.a.find(CREATE_OFF);
    const place = w.a.place();
    const journal = w.api.journal.length;
    const calls = w.calls.length;

    const press = await w.a.pressData(data, line.message_id);

    const after = w.api.journal.slice(journal);
    expect(after).toEqual([
      {
        method: 'answerCallbackQuery',
        params: { callback_query_id: press, text: LIMIT_TEXT },
      },
    ]);
    expect(after[0]?.params).not.toHaveProperty('show_alert');
    expect(w.a.place()).toEqual(place);
    expect(w.calls).toHaveLength(calls);
    expect(w.calls).not.toContain('createTask');
    expect(await w.tasks()).toBe(3);
  });

  test('причина длиннее 200 единиц UTF-16 — text не длиннее 200, ответ один', async () => {
    const w = world({ list: new LongReasonListCode() });
    await w.a.say('/start');
    await w.settle();
    const { data, line } = w.a.find(CREATE_OFF);

    const press = await w.a.pressData(data, line.message_id);

    const answers = w.answers().filter((a) => a.callback_query_id === press);
    expect(answers).toHaveLength(1);
    const text = answers[0]?.text ?? '';
    expect(LongReasonListCode.REASON.length).toBeGreaterThan(200);
    expect(text.length).toBeLessThanOrEqual(200);
    expect(text.startsWith('😀')).toBe(true);
  });

  test.each<[string, (w: World, data: string) => [typeof w.a, string]]>([
    [
      'callback_data отключённой кнопки от другого человека',
      (w, data) => [w.b, data],
    ],
    ['произвольная строка вместо callback_data', (w) => [w.a, 'zzzzz9']],
  ])(
    'подделка: %s — «Эта кнопка устарела.», UC не вызван',
    async (_, forge) => {
      const w = await limited();
      const { data, line } = w.a.find(CREATE_OFF);
      const [who, forged] = forge(w, data);
      const calls = w.calls.length;

      const press = await who.pressData(forged, line.message_id);

      expect(w.answers().at(-1)).toEqual({
        callback_query_id: press,
        text: CLOSED,
      });
      expect(w.calls).toHaveLength(calls);
      expect(await w.tasks()).toBe(3);
    },
  );

  test('действие стало доступным — нажатие прежней ссылки: ядро не вызвано, вид заново с «Экран обновился.», новая кнопка обычная', async () => {
    const w = await limited();
    const { data, line } = w.a.find(CREATE_OFF);
    await w.complete(w.ids[0] ?? '');
    await w.settle();
    const journal = w.api.journal.length;

    const press = await w.a.pressData(data, line.message_id);
    await w.settle();

    const after = w.api.journal.slice(journal);
    const [shown, ...rest] = texts(after);
    expect(rest).toEqual([]);
    expect(shown?.params.text.startsWith(STALE)).toBe(true);
    expect(after.filter((c) => c.method === 'answerCallbackQuery')).toEqual([
      { method: 'answerCallbackQuery', params: { callback_query_id: press } },
    ]);
    expect(labelsOf(w.a.place())).toContain(CREATE);
    expect(labelsOf(w.a.place())).not.toContain(CREATE_OFF);
    expect(w.calls).not.toContain('createTask');
  });

  test('отказ Bot API на answerCallbackQuery — беседа живёт: warn без текста причины, экран прежний, следующее нажатие отвечает причиной', async () => {
    const w = await limited();
    const { data, line } = w.a.find(CREATE_OFF);
    const place = w.a.place();
    w.api.failOn('answerCallbackQuery', {
      error_code: 400,
      description: 'Bad Request: query is too old',
    });

    await w.a.pressData(data, line.message_id);

    const warns = w.logger.records.filter((r) => r.level === 'warn');
    expect(warns.length).toBeGreaterThan(0);
    expect(JSON.stringify(w.logger.records)).not.toContain(LIMIT_TEXT);
    expect(w.a.place()).toEqual(place);

    const again = await w.a.pressData(data, line.message_id);

    expect(w.answers().at(-1)).toEqual({
      callback_query_id: again,
      text: LIMIT_TEXT,
    });
  });
});
