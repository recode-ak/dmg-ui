import { expect, test } from 'bun:test';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Trace } from 'dmg-core';
import { AppGraph } from 'dmg-core/graph';
import {
  AwaitingBus,
  MemoryLogger,
  testTrace,
  testUuid,
  useTempDir,
} from 'dmg-core/testing';
import {
  AssignTaskUcDef,
  CreateTaskUcDef,
  ExampleApp,
  ExampleAppDef,
  ListTasksUcDef,
  TodoModuleDef,
} from 'dmg-core/testing/example';
import type { AnyUiAppDef } from 'dmg-ui';
import {
  type ConversationExit,
  type ConversationSignal,
  Conversations,
  MemoryConversationStore,
  PlainText,
} from 'dmg-ui/chat-ui';
import {
  ExampleDialogAppDef,
  ExampleTrimmedDialogAppDef,
  exampleDialogViews,
  MemoryMessenger,
} from 'dmg-ui/chat-ui/testing';
import { UiGraphProvider } from 'dmg-ui/graph';
import {
  ApiAppDispatch,
  type PersonPlaces,
  UiNotifier,
  UiServer,
} from 'dmg-ui/server';
import {
  ExampleUiSetDef,
  exampleCodes,
  LIST_ID,
  MemoryUiObserver,
  TaskListScreenDef,
} from 'dmg-ui/testing';
import { oplogRecords, T0 } from 'dmg-ui/testing/fixtures';
import {
  PageClient,
  PageFormModel,
  type PageHistoryEntry,
  type PageHistoryPort,
  PageHost,
  type PagePlacement,
  type PageViewState,
  PageWire,
} from 'dmg-ui/web-ui';
import {
  ExamplePagesAppDef,
  examplePageRoutes,
  exampleSubjectWire,
  exampleWindowPlacements,
  MemoryPageHistory,
} from 'dmg-ui/web-ui/testing';
import * as v from 'valibot';

// Приёмка нейтральности ядра: один сценарий сторис
// `finishTasks` — создать задачу, открыть карточку, выполнить — на двух
// каналах, диалоговом (беседа на подставном мессенджере) и страничном, над
// одним кодом, экранами и сторис. Лог операций не сравнивается: страничный
// канал держит открытым и перечитывает список. Состав приложения: в беседе
// без карточки пользователя у «Назначенные мне» нет перехода к исполнителю,
// на странице и в основной беседе он открывает карточку исполнителя.

const A = testUuid(1);
const B = testUuid(2);
const WHO_A = { peer: 'peer-a', sender: 'sender-a' } as const;
const places: PersonPlaces = {
  place: async () => ({ locale: 'ru-RU', timeZone: 'Asia/Oral' }),
};
const TITLE = 'Хлеб';
const tmp = useTempDir('dmg-ui-channels-story-');

/** Общий мир канала: приложение примера, сервер UI, шина и наблюдатель. */
const base = (name: string) => {
  const bus = new AwaitingBus();
  const context = { bus, logger: new MemoryLogger() };
  const example = new ExampleApp(
    { mode: 'test', dataDir: join(tmp().path, name), users: [A, B] },
    { ...context, clock: () => T0 },
  );
  const dispatch = new ApiAppDispatch(example.api);
  const server = new UiServer({ set: ExampleUiSetDef, dispatch, context });
  return {
    bus,
    context,
    example,
    dispatch,
    server,
    observer: new MemoryUiObserver(),
  };
};

/** Идентификаторы запросов `r-1`, `r-2`, …: повтор того же отсеивается. */
const counter = () => {
  let n = 0;
  return () => {
    n += 1;
    return `r-${n}`;
  };
};

/** Итоговое состояние задач A в приложении: название и статус. */
const tasksOf = async (example: ExampleApp) => {
  const caller = await example.callers.resolve(A, testTrace());
  if (!caller.ok) throw new Error('вызывающий A не найден');
  const result = await example.api.dispatch(
    TodoModuleDef,
    ListTasksUcDef.command({}),
    caller.value,
    testTrace(),
  );
  if (!result.ok) throw new Error('listTasks: отказ');
  return result.value.map((t) => ({ title: t.title, status: t.status }));
};

/** Живое место беседы A — последнее неушедшее сообщение с вариантами. */
const livePlace = (messenger: MemoryMessenger) =>
  [...messenger.chat(WHO_A.peer)]
    .reverse()
    .find((line) => !line.retired && line.message.options.length > 0);

/** Ссылка варианта `label` живого места. */
const refOf = (messenger: MemoryMessenger, label: string): string => {
  const option = livePlace(messenger)?.message.options.find(
    (o) => o.label === label,
  );
  if (option === undefined) throw new Error(`нет варианта «${label}»`);
  return option.ref;
};

/** Подписи вариантов живого места. */
const labelsOf = (messenger: MemoryMessenger): string[] =>
  livePlace(messenger)?.message.options.map((o) => o.label) ?? [];

/** Беседа A на подставном мессенджере в приложении `app`. */
const dialogOf = (
  app: AnyUiAppDef,
  name: string,
  exits?: (exit: ConversationExit) => boolean,
) => {
  const w = base(name);
  const codes = exampleCodes();
  const messenger = MemoryMessenger.editing();
  const store = new MemoryConversationStore();
  const conversations = new Conversations({
    app,
    codes,
    server: w.server,
    views: exampleDialogViews,
    observer: w.observer,
    messenger,
    store,
    logger: w.context.logger,
    people: async (sender) => (sender === WHO_A.sender ? A : undefined),
    peers: async () => undefined,
    callers: w.example.callers,
    places,
    requestIds: counter(),
    ...(exits === undefined
      ? {}
      : { exits: { accept: async (exit) => exits(exit) } }),
  });
  new UiNotifier({
    app,
    codes,
    dispatch: w.dispatch,
    callers: w.example.callers,
    delivery: { deliver: async () => {} },
    observer: w.observer,
    context: w.context,
  }).start();
  let ids = 0;
  const head = () => {
    ids += 1;
    return { id: `s-${ids}`, ...WHO_A };
  };
  const send = (signal: ConversationSignal) => conversations.receive(signal);
  const press = (label: string) =>
    send({
      ...head(),
      kind: 'press',
      ref: refOf(messenger, label),
      press: `p-${ids}`,
    });
  const enter = (entry: string) => send({ ...head(), kind: 'enter', entry });
  return { w, messenger, conversations, send, press, enter, head, store };
};

/** Сценарий на диалоговом канале: беседа на подставном мессенджере. */
const onDialog = async () => {
  const { w, conversations, send, press, enter, head } = dialogOf(
    ExampleDialogAppDef,
    'dialog',
  );
  await enter('start');
  await send({ ...head(), kind: 'text', text: TITLE });
  await press('Открыть задачу');
  await press(TITLE);
  await press('Выполнить');
  await w.bus.delivered();
  await conversations.settled();
  return w;
};

/** Страничный канал: вкладка A, подключённая к хосту приложения `app`; история и размещения — по желанию. */
const pagesOf = async (
  app: AnyUiAppDef,
  name: string,
  extra: {
    readonly history?: PageHistoryPort;
    readonly placements?: readonly PagePlacement[];
  } = {},
) => {
  const w = base(name);
  const codes = exampleCodes();
  const tokens = new Map([['tA', A]]);
  const host = new PageHost({
    app,
    server: w.server,
    tokens: async (token) => tokens.get(token),
    callers: w.example.callers,
    places,
    logger: w.context.logger,
    subjectToWire: exampleSubjectWire.toWire,
  });
  new UiNotifier({
    app,
    codes,
    dispatch: w.dispatch,
    callers: w.example.callers,
    delivery: host.delivery,
    observer: w.observer,
    context: w.context,
  }).start();
  const wire = new PageWire(host);
  const connected = await wire.connect('tA');
  if (!connected.ok) throw new Error('connect(tA): отказ');
  const client = new PageClient({
    app,
    codes,
    routes: examplePageRoutes,
    end: connected.value,
    observer: w.observer,
    reviveSubject: exampleSubjectWire.revive,
    requestIds: counter(),
    ...(extra.history === undefined ? {} : { history: extra.history }),
    ...(extra.placements === undefined ? {} : { placements: extra.placements }),
  });
  return { w, wire, client };
};

/** Сценарий на страничном канале. */
const onPages = async () => {
  const { w, wire, client } = await pagesOf(ExamplePagesAppDef, 'pages');
  await client.route('/');
  await client.submit('main', 'create', { title: TITLE });
  await client.submit('main', 'open', { taskId: TITLE });
  await client.submit('side', 'complete', {});
  await w.bus.delivered();
  await wire.settled();
  return w;
};

/** Проекция записей исходов: то, что обязано совпасть у каналов. */
const outcomes = (observer: MemoryUiObserver) =>
  observer.records.flatMap((r) =>
    r.kind === 'outcome'
      ? [{ node: r.node, outcome: r.outcome, to: r.to, exit: r.exit }]
      : [],
  );

/** Файлы каталога привязки, которые принадлежат только примеру. */
const exampleOnly = (dir: string) =>
  readdirSync(join(import.meta.dir, '..', dir)).filter((name) =>
    /\.(code|screen|story)\.ts$/.test(name),
  );

test('сторис finishTasks: записи исходов наблюдателя двух каналов равны', async () => {
  const dialog = await onDialog();
  const pages = await onPages();
  const expected = outcomes(dialog.observer);
  expect(expected.length).toBeGreaterThan(0);
  expect(outcomes(pages.observer)).toEqual(expected);
});

test('сторис finishTasks: итоговое состояние задачи на двух каналах одно', async () => {
  const dialog = await onDialog();
  const pages = await onPages();
  const expected = [{ title: TITLE, status: 'done' as const }];
  expect(await tasksOf(dialog.example)).toEqual(expected);
  expect(await tasksOf(pages.example)).toEqual(expected);
});

test('приложения каналов делят сторис и набор', () => {
  expect(ExamplePagesAppDef.stories).toHaveLength(
    ExampleDialogAppDef.stories.length,
  );
  expect(
    ExamplePagesAppDef.stories.every(
      (story, index) => story === ExampleDialogAppDef.stories[index],
    ),
  ).toBe(true);
  expect(ExamplePagesAppDef.set).toBe(ExampleDialogAppDef.set);
});

test('в привязках каналов нет кода, экранов и сторис примера', () => {
  expect(exampleOnly('packages/chat-ui/testing/example')).toEqual([]);
  expect(exampleOnly('packages/web-ui/testing/example')).toEqual([]);
});

const CARD = 'Карточка исполнителя';
const USER_CARD = 'exampleUi/users/userCard';
const OutcomeRecord = v.object({
  op: v.string(),
  caller: v.object({ kind: v.string() }),
  result: v.object({ ok: v.boolean() }),
});

type World = ReturnType<typeof base>;

/** B создаёт задачу `title` и назначает её на A: у A на одно поручение больше. */
const assignToA = async (w: World, title = TITLE) => {
  const asB = async (requestId: string) => {
    const trace = Trace.fromRequest({ requestId });
    const caller = await w.example.callers.resolve(B, trace);
    if (!caller.ok) throw new Error('вызывающий B не найден');
    return { caller: caller.value, trace };
  };
  const first = await asB(`r-b-create-${title}`);
  const task = await w.example.api.dispatch(
    TodoModuleDef,
    CreateTaskUcDef.command({ title }),
    first.caller,
    first.trace,
  );
  if (!task.ok) throw new Error('createTask: отказ');
  const second = await asB(`r-b-assign-${title}`);
  const assigned = await w.example.api.dispatch(
    TodoModuleDef,
    AssignTaskUcDef.command({ taskId: task.value.taskId, assigneeId: A }),
    second.caller,
    second.trace,
  );
  if (!assigned.ok) throw new Error('assignTask: отказ');
  await w.bus.delivered();
};

/**
 * Результаты `getUser` от человека из лога операций мира `name`: `ok` по
 * порядку; вызовы резолвера вызывающего (`system`) не считаются.
 */
const getUserResults = (name: string) =>
  oplogRecords(join(tmp().path, name))
    .map((record) => v.parse(OutcomeRecord, record))
    .filter(
      (record) => record.op === 'getUser' && record.caller.kind === 'user',
    )
    .map((record) => record.result.ok);

test('беседа без viewUser: у «Назначенные мне» нет карточки исполнителя', async () => {
  const d = dialogOf(ExampleTrimmedDialogAppDef, 'dialog-trimmed');
  await assignToA(d.w);

  await d.enter('assigned');

  expect(labelsOf(d.messenger)).toContain('Закрыть');
  expect(labelsOf(d.messenger)).not.toContain(CARD);
});

test('страница: у «Назначенные мне» есть действие карточки исполнителя', async () => {
  const { w, client } = await pagesOf(ExamplePagesAppDef, 'pages-assigned');
  await assignToA(w);

  await client.route('/assigned');

  const actions = client.region('main').view?.actions.map((a) => a.name);
  expect(actions).toContain('openAssignee');
});

test('страница: нажатие открывает карточку исполнителя с активной учётной записью', async () => {
  const { w, wire, client } = await pagesOf(ExamplePagesAppDef, 'pages-card');
  await assignToA(w);
  await client.route('/assigned');

  const outcome = await client.submit('main', 'openAssignee', {});
  await wire.settled();

  expect(outcome).toMatchObject({ kind: 'moved' });
  const card = (['main', 'side', 'modal'] as const)
    .map((region) => client.region(region))
    .find((state) => state.view?.screen === USER_CARD);
  expect(card?.view?.data).toMatchObject({ userId: A, active: true });
});

test('основная беседа: нажатие открывает карточку исполнителя', async () => {
  const d = dialogOf(ExampleDialogAppDef, 'dialog-card');
  await assignToA(d.w);
  await d.enter('assigned');

  await d.press(CARD);
  await d.conversations.settled();

  expect(
    d.w.observer.records.filter(
      (r) =>
        r.kind === 'outcome' && r.outcome === 'moved' && r.to === USER_CARD,
    ),
  ).toHaveLength(1);
  expect(getUserResults('dialog-card')).toEqual([true]);
  const card = livePlace(d.messenger)?.message.text;
  expect(card === undefined ? '' : PlainText.of(card)).toContain(
    'Учётная запись активна',
  );
});

const SECOND = 'Молоко';
/** Снимок беседы: экран и путь, которых после принятого выхода нет. */
const Saved = v.object({
  screen: v.optional(v.unknown()),
  path: v.optional(v.unknown()),
});
const textOfLive = (messenger: MemoryMessenger) => {
  const message = livePlace(messenger)?.message;
  return message === undefined ? '' : PlainText.of(message.text);
};

/**
 * Основная беседа: A открыл «Назначенные мне» и карточку исполнителя; пока он
 * на карточке, B назначает ему вторую задачу; A нажимает «Закрыть».
 */
const returnFromCard = async () => {
  const d = dialogOf(ExampleDialogAppDef, 'dialog-return');
  await assignToA(d.w);
  await d.enter('assigned');
  await d.press(CARD);
  await assignToA(d.w, SECOND);
  await d.press('Закрыть');
  await d.conversations.settled();
  return d;
};

test('беседа, возврат с карточки исполнителя: список поручений перечитан — обе задачи', async () => {
  const d = await returnFromCard();

  expect(textOfLive(d.messenger)).toStartWith(
    'Карточка просмотрена\n\nПользователь закрыл карточку.\n\n',
  );
  expect(textOfLive(d.messenger)).toContain(TITLE);
  expect(textOfLive(d.messenger)).toContain(SECOND);
});

test('беседа, возврат с карточки исполнителя: снова «Назначенные мне», путь снят — «Назад» нет', async () => {
  const d = await returnFromCard();

  expect(labelsOf(d.messenger)).toContain(CARD);
  expect(labelsOf(d.messenger)).not.toContain('Назад');
});

test('беседа, меню: вход menu даёт «Мои задачи», «Назначенные мне» и «Закрыть»', async () => {
  const d = dialogOf(ExampleDialogAppDef, 'dialog-menu');

  await d.enter('menu');

  expect(labelsOf(d.messenger).slice(0, 3)).toEqual([
    'Мои задачи',
    'Назначенные мне',
    'Закрыть',
  ]);
});

/** Меню → «Мои задачи» → задача → «Открыть задачу» → «Выполнить» → «К списку». */
const completedFromMenu = async () => {
  const d = dialogOf(ExampleDialogAppDef, 'dialog-menu-path');
  await d.enter('menu');
  await d.press('Мои задачи');
  await d.send({ ...d.head(), kind: 'text', text: TITLE });
  await d.press('Открыть задачу');
  await d.press(TITLE);
  await d.press('Выполнить');
  await d.w.bus.delivered();
  await d.conversations.settled();
  await d.press('К списку');
  return d;
};

test('беседа, меню → список → карточка → «К списку»: «Назад» ведёт в меню', async () => {
  const d = await completedFromMenu();

  await d.press('Назад');

  expect(labelsOf(d.messenger).slice(0, 3)).toEqual([
    'Мои задачи',
    'Назначенные мне',
    'Закрыть',
  ]);
  expect(labelsOf(d.messenger)).not.toContain('Назад');
});

test('беседа, порт выхода: принятый выход при непустом пути сбрасывает путь', async () => {
  const taken: ConversationExit[] = [];
  const d = dialogOf(ExampleDialogAppDef, 'dialog-exit-port', (exit) => {
    taken.push(exit);
    return true;
  });
  await assignToA(d.w);
  await d.enter('assigned');
  await d.press(CARD);

  await d.press('Закрыть');
  await d.conversations.settled();

  const saved = v.parse(Saved, await d.store.load(WHO_A.peer));
  expect(taken).toHaveLength(1);
  expect(taken[0]?.screen).toBe(USER_CARD);
  expect(saved).toEqual({});
  expect(livePlace(d.messenger)).toBeUndefined();
});

/** Метки записи истории: сколько своих записей позади и положена ли она открытием слоя. */
const Marks = v.object({
  depth: v.optional(v.number(), 0),
  over: v.optional(v.boolean(), false),
});
const marksOf = (entry: PageHistoryEntry | undefined) =>
  v.parse(Marks, JSON.parse(String(entry?.record)));

/** Область `main` как список названий назначенных задач. */
const AssignedData = v.object({
  tasks: v.array(v.object({ title: v.string(), status: v.string() })),
});
const titlesOf = (state: PageViewState): string[] =>
  v.parse(AssignedData, state.view?.data).tasks.map((task) => task.title);

/**
 * Страница A на `/assigned`: у него одно поручение, открыта карточка
 * исполнителя; пока она открыта, B назначает ему вторую задачу.
 */
const cardOnPage = async () => {
  const history = new MemoryPageHistory('/assigned');
  const p = await pagesOf(ExamplePagesAppDef, 'pages-return', { history });
  await assignToA(p.w);
  await p.client.boot();
  await p.client.submit('main', 'openAssignee', {});
  await p.wire.settled();
  await assignToA(p.w, SECOND);
  await p.wire.settled();
  return { ...p, history };
};

test('страница, карточка исполнителя: открытие — запись с over, карточка в side; список поручений перечитан по событию назначения', async () => {
  const p = await cardOnPage();

  expect(p.client.region('side').view?.screen).toBe(USER_CARD);
  expect(p.history.position).toBe(1);
  expect(marksOf(p.history.current())).toEqual({ depth: 1, over: true });
  expect(titlesOf(p.client.region('main')).sort()).toEqual([SECOND, TITLE]);
});

test('страница, возврат с карточки исполнителя: карточка закрыта, main — тот же экран и объект, позиция истории прежняя, записей не прибавилось', async () => {
  const p = await cardOnPage();
  const main = p.client.region('main');

  const outcome = await p.client.submit('side', 'close', {});
  await p.wire.settled();
  await p.history.settled();

  expect(outcome).toMatchObject({ kind: 'exited', exit: 'closed' });
  expect(p.client.region('side').status).toBe('empty');
  expect(p.client.region('main')).toBe(main);
  expect(titlesOf(p.client.region('main')).sort()).toEqual([SECOND, TITLE]);
  expect(p.history.position).toBe(0);
  expect(p.history.pushes).toBe(1);
  expect(p.history.entries()).toHaveLength(2);
});

const MENU_ID = 'exampleUi/todo/mainMenu';
/** Окно задачи — размещение примера; список задач — в основной области, под окном. */
const MENU_PLACEMENTS: readonly PagePlacement[] = [
  { screen: TaskListScreenDef, region: 'main' },
  ...exampleWindowPlacements,
];

/** A создаёт себе задачу: владелец видит её в списке и может выполнить. */
const ownTask = async (w: World, title = TITLE) => {
  const trace = Trace.fromRequest({ requestId: `r-a-create-${title}` });
  const caller = await w.example.callers.resolve(A, trace);
  if (!caller.ok) throw new Error('вызывающий A не найден');
  const created = await w.example.api.dispatch(
    TodoModuleDef,
    CreateTaskUcDef.command({ title }),
    caller.value,
    trace,
  );
  if (!created.ok) throw new Error('createTask: отказ');
  await w.bus.delivered();
};

/** Страница A на `/menu`: «Мои задачи», окно задачи, назначение и выполнение в окне. */
const windowFromMenu = async () => {
  const history = new MemoryPageHistory('/menu');
  const p = await pagesOf(ExamplePagesAppDef, 'pages-window', {
    history,
    placements: MENU_PLACEMENTS,
  });
  await ownTask(p.w);
  await p.client.boot();
  await p.client.submit('main', 'tasks', {});
  await p.client.submit('main', 'open', { taskId: TITLE });
  await p.client.submit('modal', 'assign', { assigneeId: B });
  await p.client.submit('modal', 'complete', {});
  await p.wire.settled();
  return { ...p, history };
};

/** Меню в основной области, ни окна, ни панели. */
const expectMenuOnly = (client: PageClient) => {
  expect(client.region('main').view?.screen).toBe(MENU_ID);
  expect(client.region('modal').status).toBe('empty');
  expect(client.region('side').status).toBe('empty');
};

test('страница, меню → «Мои задачи» → окно: запись на список, запись открытия окна с over; назначение и выполнение — замены', async () => {
  const p = await windowFromMenu();

  expect(p.client.region('modal').view?.data).toMatchObject({
    status: 'done',
  });
  expect(p.history.entries()).toHaveLength(3);
  expect(p.history.pushes).toBe(2);
  expect(p.history.position).toBe(2);
  expect(p.history.entries().map((entry) => marksOf(entry))).toEqual([
    { depth: 0, over: false },
    { depth: 1, over: false },
    { depth: 2, over: true },
  ]);
});

test('страница, закрытие окна client.close: движение назад — список без окна; затем «Назад» — меню', async () => {
  const p = await windowFromMenu();

  p.client.close('modal');
  await p.history.settled();

  expect(p.client.region('modal').status).toBe('empty');
  expect(p.client.region('main').view?.screen).toBe(LIST_ID);
  expect(p.history.position).toBe(1);
  expect(p.history.pushes).toBe(2);
  await p.history.back();
  expectMenuOnly(p.client);
  expect(p.history.position).toBe(0);
});

test('страница, «К списку» в окне: окно закрыто движением назад; затем «Назад» — меню', async () => {
  const p = await windowFromMenu();

  await p.client.submit('modal', 'back', {});
  await p.wire.settled();
  await p.history.settled();

  expect(p.client.region('modal').status).toBe('empty');
  expect(p.client.region('main').view?.screen).toBe(LIST_ID);
  expect(p.history.position).toBe(1);
  expect(p.history.pushes).toBe(2);
  await p.history.back();
  expectMenuOnly(p.client);
});

test('страница, «Назад» при открытом окне закрывает его; следующий «Назад» — меню', async () => {
  const p = await windowFromMenu();

  await p.history.back();

  expect(p.client.region('modal').status).toBe('empty');
  expect(p.client.region('main').view?.screen).toBe(LIST_ID);
  await p.history.back();
  expectMenuOnly(p.client);
});

// Сценарий 5: поле входа. Вид поля (подпись, подсказка, пример, пределы, вид)
// берётся из схемы действия ядром и одинаков на двух каналах и в графе;
// число из текста приводит ядро, схема отвергает не число и выход за предел
// своим текстом. Действие `jumpTo` списка задач — поле `part` с пределами
// 1…99; `create` — строковое поле с подсказкой и примером. Каналы узнают о
// поле только из вида экрана.

const PART_FIELD = {
  name: 'part',
  label: 'Часть',
  kind: 'number',
  optional: false,
  hint: 'Номер части списка, с первой',
  example: 2,
  limits: { min: 1, max: 99, integer: true },
};
const PART_QUESTION = [
  'Введите: Часть',
  'Номер части списка, с первой',
  'Пример: 2',
  'Пределы: от 1 до 99, целое',
].join('\n');
const THREE = ['Хлеб', 'Молоко', 'Сыр'];

/** Текст последнего сообщения беседы A: вопрос поля идёт без вариантов, живого места у него нет. */
const lastText = (messenger: MemoryMessenger): string => {
  const line = messenger.chat(WHO_A.peer).at(-1);
  return line === undefined ? '' : PlainText.of(line.message.text);
};

/** Снимок беседы: черновик входа с полями, которые беседа спросит. */
const Draft = v.object({
  draft: v.object({ fields: v.array(v.unknown()) }),
});

/** Заголовки задач списка в данных вида — на странице их две на часть. */
const listTitles = (state: PageViewState): string[] =>
  v
    .parse(
      v.object({ tasks: v.array(v.object({ title: v.string() })) }),
      state.view?.data,
    )
    .tasks.map((task) => task.title);

/** Узел графа: свойства схемы входа действия `action` списка. */
const graphInput = (action: string) => {
  const graph = new AppGraph({
    def: ExampleAppDef,
    providers: [
      new UiGraphProvider({
        set: ExampleUiSetDef,
        apps: [ExamplePagesAppDef],
      }),
    ],
  }).build();
  const props = graph.node(`exampleUi/todo/taskList/${action}`)?.props;
  return v.parse(
    v.object({
      input: v.object({
        properties: v.record(v.string(), v.record(v.string(), v.unknown())),
      }),
    }),
    props,
  ).input.properties;
};

/** Беседа A на списке с тремя задачами: список — часть 1. */
const dialogList = async (name: string) => {
  const d = dialogOf(ExampleDialogAppDef, name);
  for (const title of THREE) await ownTask(d.w, title);
  await d.enter('start');
  return d;
};

/** Страница A на списке с тремя задачами. */
const pageList = async (name: string) => {
  const p = await pagesOf(ExamplePagesAppDef, name);
  for (const title of THREE) await ownTask(p.w, title);
  await p.client.route('/');
  return p;
};

const fieldsOnPage = (client: PageClient, action: string, name: string) =>
  client
    .region('main')
    .view?.actions.find((a) => a.name === action)
    ?.fields.find((f) => f.name === name);

test('поле part: вид — подпись, подсказка, пример, пределы, kind number — одинаков в беседе и на странице', async () => {
  const d = await dialogList('field-dialog-view');
  await d.press('К части');
  const asked = v.parse(Draft, await d.store.load(WHO_A.peer)).draft.fields;
  const p = await pageList('field-pages-view');

  const onPage = fieldsOnPage(p.client, 'jumpTo', 'part');

  expect(onPage).toMatchObject(PART_FIELD);
  expect(asked).toHaveLength(1);
  expect(asked[0]).toEqual(onPage);
});

test('беседа, jumpTo: вопрос с подсказкой, примером и пределами; «abc» — замечание схемы; «2» — часть 2', async () => {
  const d = await dialogList('field-dialog-jump');
  const first = lastText(d.messenger);

  await d.press('К части');
  const question = lastText(d.messenger);
  await d.send({ ...d.head(), kind: 'text', text: 'abc' });
  const noted = lastText(d.messenger);
  await d.send({ ...d.head(), kind: 'text', text: '2' });
  await d.conversations.settled();
  const second = lastText(d.messenger);

  expect(question).toBe(PART_QUESTION);
  expect(noted).toBe(`Введите номер части\n\n${PART_QUESTION}`);
  const shown = (text: string) => THREE.filter((t) => text.includes(t));
  expect(shown(first)).toHaveLength(2);
  expect(shown(second)).toHaveLength(1);
});

test('беседа, jumpTo: «0» — замечание о пределе её текстом, вопрос повторён', async () => {
  const d = await dialogList('field-dialog-zero');
  await d.press('К части');

  await d.send({ ...d.head(), kind: 'text', text: '0' });

  expect(lastText(d.messenger)).toBe(
    `Части начинаются с первой\n\n${PART_QUESTION}`,
  );
});

test('страница, jumpTo { part: «2» }: движение на адрес с page 1, на странице одна задача', async () => {
  const p = await pageList('field-pages-jump');
  expect(listTitles(p.client.region('main'))).toHaveLength(2);

  const outcome = await p.client.submit('main', 'jumpTo', { part: '2' });
  await p.wire.settled();

  expect(outcome).toMatchObject({ kind: 'moved' });
  expect(p.client.region('main').view?.address).toEqual({
    screen: LIST_ID,
    params: { page: 1 },
  });
  expect(listTitles(p.client.region('main'))).toHaveLength(1);
});

test('страница, jumpTo { part: «0» }: rejected, замечание у поля part, форма и введённое остались', async () => {
  const p = await pageList('field-pages-zero');

  const outcome = await p.client.submit('main', 'jumpTo', { part: '0' });

  expect(outcome).toMatchObject({ kind: 'rejected' });
  const state = p.client.region('main');
  expect(state.view?.address).toEqual({
    screen: LIST_ID,
    params: { page: 0 },
  });
  expect(state.issues).toEqual([
    { field: 'part', text: 'Части начинаются с первой' },
  ]);
  const form = new PageFormModel(ExampleUiSetDef)
    .of(state)
    .forms.find((f) => f.name === 'jumpTo');
  expect(form?.fields).toMatchObject([
    {
      value: '0',
      issues: ['Части начинаются с первой'],
      ...PART_FIELD,
    },
  ]);
});

test('страница, jumpTo { part: «abc» }: rejected текстом схемы, вызов не ушёл', async () => {
  const p = await pageList('field-pages-abc');

  const outcome = await p.client.submit('main', 'jumpTo', { part: 'abc' });

  expect(outcome).toMatchObject({ kind: 'rejected' });
  expect(p.client.region('main').issues).toEqual([
    { field: 'part', text: 'Введите номер части' },
  ]);
});

test('create.title: подсказка и пример в виде поля и в вопросе беседы; на странице — в форме', async () => {
  const d = dialogOf(ExampleDialogAppDef, 'field-dialog-title');
  await d.enter('start');
  await d.press('Создать задачу');
  const p = await pagesOf(ExamplePagesAppDef, 'field-pages-title');
  await p.client.route('/');

  const onPage = fieldsOnPage(p.client, 'create', 'title');

  expect(lastText(d.messenger)).toStartWith(
    'Введите: Название задачи\nКоротко: что нужно сделать\nПример: Купить хлеб',
  );
  expect(onPage).toMatchObject({
    label: 'Название задачи',
    kind: 'string',
    hint: 'Коротко: что нужно сделать',
    example: 'Купить хлеб',
  });
  const asked = v.parse(Draft, await d.store.load(WHO_A.peer)).draft.fields;
  expect(asked[0]).toEqual(onPage);
});

test('граф: hint, title, пределы и пример полей part и title — те же, что в виде полей каналов', async () => {
  const p = await pageList('field-graph');
  const part = fieldsOnPage(p.client, 'jumpTo', 'part');
  const title = fieldsOnPage(p.client, 'create', 'title');

  const jump = graphInput('jumpTo');
  const create = graphInput('create');

  expect(jump.part).toMatchObject({
    title: part?.label,
    hint: part?.hint,
    minimum: part?.limits?.min,
    maximum: part?.limits?.max,
    examples: [part?.example],
  });
  expect(create.title).toMatchObject({
    title: title?.label,
    hint: title?.hint,
    examples: [title?.example],
  });
});
