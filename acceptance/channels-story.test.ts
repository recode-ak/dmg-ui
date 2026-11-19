import { expect, test } from 'bun:test';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Trace } from 'dmg-core';
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
  StartWorkStoryDef,
} from 'dmg-ui/testing';
import { oplogRecords, T0 } from 'dmg-ui/testing/fixtures';
import { PageClient, PageHost, PageWire } from 'dmg-ui/web-ui';
import { ExamplePagesAppDef, examplePageRoutes } from 'dmg-ui/web-ui/testing';
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

/** Страничный канал: вкладка A, подключённая к хосту приложения `app`. */
const pagesOf = async (app: AnyUiAppDef, name: string) => {
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
    requestIds: counter(),
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
  // Меню «Начать работу» в приложении страниц пока не объявлено.
  const shared = ExampleDialogAppDef.stories.filter(
    (story) => story !== StartWorkStoryDef,
  );
  expect(ExamplePagesAppDef.stories).toHaveLength(shared.length);
  expect(
    ExamplePagesAppDef.stories.every((story, index) => story === shared[index]),
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
