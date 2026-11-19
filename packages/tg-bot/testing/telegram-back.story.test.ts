import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { Trace } from 'dmg-core';
import {
  AwaitingBus,
  MemoryLogger,
  testUuid,
  useTempDir,
} from 'dmg-core/testing';
import {
  CreateTaskUcDef,
  ExampleApp,
  type ExampleUser,
  TodoModuleDef,
} from 'dmg-core/testing/example';
import { Conversations, MemoryConversationStore } from 'dmg-ui/chat-ui';
import {
  ExampleDialogAppDef,
  exampleDialogViews,
} from 'dmg-ui/chat-ui/testing';
import {
  ApiAppDispatch,
  type PersonPlaces,
  type UcDispatch,
  UiServer,
} from 'dmg-ui/server';
import {
  ExampleUiSetDef,
  exampleCodes,
  MemoryUiObserver,
  TaskListScreenDef,
  UserCardScreenDef,
} from 'dmg-ui/testing';
import { T0 } from 'dmg-ui/testing/fixtures';
import { TelegramMessenger, TelegramUpdates } from 'dmg-ui/tg-bot';
import { type BotChatLine, MemoryBotApi, TestUpdates } from '.';

// «Назад» и структурный переход на Telegram: вариант «Назад» и команда
// `/back` ведут по пути экранов, «К моим задачам» кладёт карточку в путь,
// листание путь не растит, подписи клавиатуры не повторяются. Правила пути
// беседы закреплены в `conversation-path.test.ts`, разбор `/back` — в
// `telegram-signals.test.ts`; здесь — связка «апдейт → сигнал → экран» на
// учебном приложении и подставном порту Bot API.

const A = testUuid(1);
const CHAT_A = 7350001234;
const BOT = 7350009000;
const ENTRY_POINTS = [
  { entry: 'start', via: 'command', key: 'start' },
  { entry: 'menu', via: 'command', key: 'menu' },
  { entry: 'assigned', via: 'command', key: 'assigned' },
];
/** Автокнопка канала: подпись «Назад» задаёт канал, а не Def экрана. */
const BACK = 'Назад';
const PREV = TaskListScreenDef.actions.prev.label;
const toTasks = () => UserCardScreenDef.actions.tasks.label;
const CARD = 'Карточка исполнителя';
const CLOSED = 'Эта кнопка устарела.';
const MENU_LABELS = ['Мои задачи', 'Назначенные мне', 'Закрыть'];
const tmp = useTempDir('dmg-ui-telegram-back-');

const places: PersonPlaces = {
  place: async () => ({ locale: 'ru-RU', timeZone: 'Asia/Oral' }),
};

const labelsOf = (line: BotChatLine): string[] =>
  line.keyboard.flatMap((row) => row.map((button) => button.text));

/** Подпись без пометки «🚫 »: для сравнения подписей на живой клавиатуре. */
const bare = (label: string) => label.replace(/^🚫 /, '');

/** Приложение, сервер и порт Bot API; один человек — A. */
const world = (name = 'one') => {
  const bus = new AwaitingBus();
  const logger = new MemoryLogger();
  const context = { bus, logger };
  const example = new ExampleApp(
    { mode: 'test', dataDir: join(tmp().path, name), users: [A] },
    { ...context, clock: () => T0 },
  );
  const inner = new ApiAppDispatch(example.api);
  const dispatch: UcDispatch<ExampleUser> = {
    dispatch: async (request) => inner.dispatch(request),
  };
  const server = new UiServer({ set: ExampleUiSetDef, dispatch, context });
  const api = new MemoryBotApi();
  const updates = new TestUpdates();
  const messenger = new TelegramMessenger({ api, logger });
  let epoch = 0;
  const conversations = new Conversations({
    app: ExampleDialogAppDef,
    codes: exampleCodes(),
    server,
    views: exampleDialogViews,
    observer: new MemoryUiObserver(),
    messenger,
    store: new MemoryConversationStore(),
    logger,
    people: async (sender) => (sender === String(CHAT_A) ? A : undefined),
    peers: async (uuid) => (uuid === A ? String(CHAT_A) : undefined),
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

  /** Живое место — последнее сообщение чата с нажимаемой кнопкой. */
  const place = (): BotChatLine => {
    const line = api
      .chat(CHAT_A)
      .findLast((l) =>
        l.keyboard.flat().some((button) => 'callback_data' in button),
      );
    if (line === undefined) throw new Error('живого места нет');
    return line;
  };

  const find = (label: string) => {
    const line = place();
    const button = line.keyboard.flat().find((one) => one.text === label);
    if (button === undefined || !('callback_data' in button)) {
      throw new Error(`нет кнопки «${label}» в живом месте`);
    }
    return { line, data: button.callback_data };
  };

  let requests = 0;
  const a = {
    say: async (text: string) => {
      await telegram.receive(updates.text(CHAT_A, text));
      await settle();
    },
    place,
    find,
    /** Нажатие `data` на сообщении `messageId`; возвращает id нажатия. */
    pressData: async (data: string, messageId: number) => {
      const update = updates.press(CHAT_A, data, messageId);
      await telegram.receive(update);
      await settle();
      return update.callback_query.id;
    },
    press: async (label: string) => {
      const { data, line } = find(label);
      const update = updates.press(CHAT_A, data, line.message_id);
      await telegram.receive(update);
      await settle();
    },
  };

  return {
    api,
    settle,
    a,
    /** Задача владельца A создана мимо беседы. */
    create: async (title: string): Promise<void> => {
      requests += 1;
      const trace = Trace.fromRequest({ requestId: `r-outside-${requests}` });
      const caller = await example.callers.resolve(A, trace);
      if (!caller.ok) throw new Error('вызывающий не найден');
      const created = await example.api.dispatch(
        TodoModuleDef,
        CreateTaskUcDef.command({ title }),
        caller.value,
        trace,
      );
      if (!created.ok) throw new Error('createTask не исполнен');
      await bus.delivered();
    },
    /** Ответы на нажатия по порядку: параметры `answerCallbackQuery`. */
    answers: () =>
      api.journal.flatMap((call) =>
        call.method === 'answerCallbackQuery' ? [call.params] : [],
      ),
  };
};

type World = ReturnType<typeof world>;

/** Список «Мои задачи» → «Хлеб» → «Открыть задачу» → карточка «Хлеб». */
const onCard = async (w: World) => {
  await w.a.say('/start');
  await w.a.say('Хлеб');
  await w.a.press('Открыть задачу');
  await w.a.press('Хлеб');
};

/** Карточка исполнителя: «Хлеб» назначен самому A, вход `/assigned`, «Карточка исполнителя». */
const onUserCard = async (w: World) => {
  await onCard(w);
  await w.a.press('Назначить');
  await w.a.say(A);
  await w.a.say('/assigned');
  await w.a.press(CARD);
};

describe('Telegram — «Назад» и /back', () => {
  test('карточка задачи: клавиатура заканчивается «Назад»; нажатие правит то же сообщение, список перечитан, ответ на нажатие один', async () => {
    const w = world();
    await onCard(w);
    const card = w.a.place();
    await w.create('Молоко');
    const { data, line } = w.a.find(BACK);
    const journal = w.api.journal.length;

    const press = await w.a.pressData(data, line.message_id);

    expect(labelsOf(card).at(-1)).toBe(BACK);
    const after = w.api.journal.slice(journal);
    const edits = after.filter((call) => call.method === 'editMessageText');
    expect(edits).toHaveLength(1);
    expect(edits[0]?.params.message_id).toBe(card.message_id);
    expect(after.filter((call) => call.method === 'sendMessage')).toEqual([]);
    expect(
      after.filter((call) => call.method === 'answerCallbackQuery'),
    ).toEqual([
      { method: 'answerCallbackQuery', params: { callback_query_id: press } },
    ]);
    expect(w.a.place().text).toStartWith('Мои задачи');
    expect(w.a.place().text).toContain('Молоко');
  });

  test('старое «Назад» прежнего показа — «Эта кнопка устарела.»', async () => {
    const w = world();
    await onCard(w);
    const { data, line } = w.a.find(BACK);
    await w.a.pressData(data, line.message_id);

    const again = await w.a.pressData(data, line.message_id);

    expect(w.answers().at(-1)).toEqual({
      callback_query_id: again,
      text: CLOSED,
    });
  });

  test('/back с путём: тот же экран, что у «Назад», но новым сообщением — у прежнего снимается клавиатура; ответа на нажатие нет', async () => {
    const viaButton = world('button');
    await onCard(viaButton);
    await viaButton.a.press(BACK);
    const viaCommand = world('command');
    await onCard(viaCommand);
    const card = viaCommand.a.place();
    const journal = viaCommand.api.journal.length;
    const answered = viaCommand.answers().length;

    await viaCommand.a.say('/back');

    const after = viaCommand.api.journal.slice(journal);
    expect(after.map((call) => call.method)).toEqual([
      'editMessageReplyMarkup',
      'sendMessage',
    ]);
    expect(after[0]?.params).toMatchObject({ message_id: card.message_id });
    expect(viaCommand.answers()).toHaveLength(answered);
    expect(viaCommand.a.place().message_id).toBeGreaterThan(card.message_id);
    expect(viaCommand.a.place().text).toBe(viaButton.a.place().text);
    expect(labelsOf(viaCommand.a.place())).toEqual(
      labelsOf(viaButton.a.place()),
    );
  });
});

describe('Telegram — «К моим задачам»', () => {
  test('из карточки исполнителя: список «Мои задачи» с «Назад»; цепочка «Назад» — карточка, «Назначенные мне» без «Назад»', async () => {
    const w = world();
    await onUserCard(w);
    expect(labelsOf(w.a.place())).toEqual([toTasks(), 'Закрыть', BACK]);

    await w.a.press(toTasks());

    expect(w.a.place().text).toStartWith('Мои задачи');
    expect(labelsOf(w.a.place()).at(-1)).toBe(BACK);
    await w.a.press(BACK);
    expect(w.a.place().text).toContain('Учётная запись активна');
    await w.a.press(BACK);
    expect(labelsOf(w.a.place())).toContain(CARD);
    expect(labelsOf(w.a.place())).not.toContain(BACK);
  });
});

describe('Telegram — листание и подписи', () => {
  test('листание путь не растит: после «Дальше» один «Назад» ведёт в меню, «Предыдущая страница» — действие экрана', async () => {
    const w = world();
    for (const title of ['Хлеб', 'Молоко', 'Сыр']) await w.create(title);
    await w.a.say('/menu');
    await w.a.press('Мои задачи');
    const first = w.a.place().text;

    await w.a.press('Дальше');

    expect(w.a.place().text).not.toBe(first);
    expect(labelsOf(w.a.place())).toContain(PREV);
    expect(labelsOf(w.a.place()).filter((label) => label === BACK)).toEqual([
      BACK,
    ]);
    await w.a.press(BACK);
    expect(labelsOf(w.a.place()).slice(0, 3)).toEqual(MENU_LABELS);
  });

  test('подписи клавиатуры без повторов после снятия «🚫»: список при непустом пути и карточка задачи', async () => {
    const w = world();
    await w.a.say('/menu');
    await w.a.press('Мои задачи');
    const names = (): string[] => labelsOf(w.a.place()).map(bare);
    const duplicates = (list: string[]) =>
      list.filter((name, i) => list.indexOf(name) !== i);
    expect(labelsOf(w.a.place())).toContain(BACK);
    expect(duplicates(names())).toEqual([]);

    await w.a.say('Хлеб');
    await w.a.press('Открыть задачу');
    await w.a.press('Хлеб');

    expect(duplicates(names())).toEqual([]);
  });
});
