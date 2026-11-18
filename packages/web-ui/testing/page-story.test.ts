import { expect, test } from 'bun:test';
import {
  AwaitingBus,
  MemoryLogger,
  testUuid,
  useTempDir,
} from 'dmg-core/testing';
import { ExampleApp } from 'dmg-core/testing/example';
import {
  ApiAppDispatch,
  type PersonPlaces,
  UiNotifier,
  UiServer,
} from 'dmg-ui/server';
import {
  ASSIGNED_ID,
  CARD_ID,
  ExampleUiSetDef,
  exampleCodes,
  LIST_ID,
  MemoryUiObserver,
} from 'dmg-ui/testing';
import { oplogRecords, T0 } from 'dmg-ui/testing/fixtures';
import {
  ClientMessage,
  PageClient,
  PageHost,
  type PageServerPort,
  PageText,
  PageWire,
  ServerMessage,
} from 'dmg-ui/web-ui';
import * as v from 'valibot';
import {
  ExamplePagesAppDef,
  examplePageRoutes,
  examplePageViews,
} from './index';

type ClientMsg = v.InferOutput<typeof ClientMessage>;
type ServerMsg = v.InferOutput<typeof ServerMessage>;

// Сквозной тест сторис на страничном канале (TST-09 — единственный на канал):
// пользователи A и B, учебное приложение во временном каталоге, сервер UI,
// уведомитель с доставкой хоста и вкладки с клиентом на проводе. Те же
// сценарии, что у диалога, но граница — строки JSON; два экрана открыты
// одновременно (`main` и `side`).

const A = testUuid(1);
const B = testUuid(2);
const ASSIGNED = { screen: ASSIGNED_ID, params: {} };
const ASSIGNED_NOTE = 'exampleUi/todo/taskAssigned';
const COMPLETED_NOTE = 'exampleUi/todo/taskCompleted';
const tmp = useTempDir('dmg-ui-page-story-');
const places: PersonPlaces = {
  place: async () => ({ locale: 'ru-RU', timeZone: 'Asia/Oral' }),
};

/** Вкладка личности: свой провод (журнал) и клиент; `requestId` — `<префикс>-<n>`. */
const tab = async (host: PageServerPort, token: string, prefix: string) => {
  const wire = new PageWire(host);
  const connected = await wire.connect(token);
  if (!connected.ok) throw new Error(`connect(${token}): отказ`);
  let requests = 0;
  const client = new PageClient({
    app: ExamplePagesAppDef,
    codes: exampleCodes(),
    routes: examplePageRoutes,
    end: connected.value,
    observer: new MemoryUiObserver(),
    requestIds: () => {
      requests += 1;
      return `${prefix}-${requests}`;
    },
  });
  return { wire, client, text: new PageText(client, examplePageViews) };
};

/** Приложение, сервер, хост канала, уведомитель и две вкладки. */
const world = async () => {
  const bus = new AwaitingBus();
  const context = { bus, logger: new MemoryLogger() };
  const example = new ExampleApp(
    { mode: 'test', dataDir: tmp().path, users: [A, B] },
    { ...context, clock: () => T0 },
  );
  const dispatch = new ApiAppDispatch(example.api);
  const server = new UiServer({ set: ExampleUiSetDef, dispatch, context });
  const tokens = new Map([
    ['tA', A],
    ['tB', B],
  ]);
  const host = new PageHost({
    app: ExamplePagesAppDef,
    server,
    tokens: async (token) => tokens.get(token),
    callers: example.callers,
    places,
    logger: context.logger,
  });
  new UiNotifier({
    app: ExamplePagesAppDef,
    codes: exampleCodes(),
    dispatch,
    callers: example.callers,
    delivery: host.delivery,
    observer: new MemoryUiObserver(),
    context,
  }).start();
  return {
    bus,
    a: await tab(host, 'tA', 'a'),
    b: await tab(host, 'tB', 'b'),
  };
};

type World = Awaited<ReturnType<typeof world>>;

/** Шина доставила, провода тихи: полный круг без новых сообщений (без таймеров, TST-04). */
const settle = async (w: World) => {
  const size = () => w.a.wire.messages.length + w.b.wire.messages.length;
  let seen = -1;
  while (seen !== size()) {
    seen = size();
    await w.bus.delivered();
    await w.a.wire.settled();
    await w.b.wire.settled();
  }
};

const Record = v.object({
  op: v.string(),
  caller: v.object({
    kind: v.string(),
    subjectId: v.optional(v.string()),
  }),
  trace: v.object({
    cause: v.object({ kind: v.string() }),
    correlationId: v.string(),
  }),
  result: v.object({ ok: v.boolean() }),
  events: v.array(v.object({ name: v.string() })),
});

/** Записи лога операций с операцией `op`. */
const records = (op: string) =>
  oplogRecords(tmp().path)
    .map((r) => v.parse(Record, r))
    .filter((r) => r.op === op);

/** Сообщения журнала как объекты. */
const parsed = (wire: PageWire): unknown[] =>
  wire.messages.map((text) => JSON.parse(text));

/** Сообщения клиента в журнале провода по порядку. */
const clientSide = (wire: PageWire): ClientMsg[] =>
  parsed(wire).filter((m): m is ClientMsg => v.is(ClientMessage, m));

/** Сообщения сервера в журнале провода по порядку. */
const serverSide = (wire: PageWire): ServerMsg[] =>
  parsed(wire).filter((m): m is ServerMsg => v.is(ServerMessage, m));

const readsOf = (records_: ReturnType<typeof records>, subjectId: string) =>
  records_
    .filter((r) => r.caller.subjectId === subjectId)
    .map((r) => `${r.trace.cause.kind}:${r.trace.correlationId}`);

test('сторис на страничном канале: задачи A, поручение B, два экрана, перечитывание и уведомления по проводу', async () => {
  const w = await world();
  const { a, b } = w;

  // 1. B: «Назначенные мне» в main, пусто.
  await b.client.route('/assigned');
  await settle(w);
  expect(b.client.region('main').view?.screen).toBe(ASSIGNED_ID);
  expect(b.client.region('main').view?.revision).toBe(1);
  expect(b.text.page()).toContain('Назначенные мне');
  expect(b.text.page()).toContain('Поручений нет.');

  // 2. A: «Мои задачи»; форма create — выход created, затем вход start снова.
  await a.client.route('/');
  expect(a.client.region('main').view?.screen).toBe(LIST_ID);
  expect(a.text.page()).toContain('Мои задачи');
  for (const title of ['Хлеб', 'Молоко', 'Сыр']) {
    const outcome = await a.client.submit('main', 'create', { title });
    await settle(w);
    expect(outcome).toMatchObject({ kind: 'exited', exit: 'created' });
    expect(a.client.region('main').note).toBe('Задача создана');
    expect(a.client.region('main').view?.address).toEqual({
      screen: LIST_ID,
      params: { page: 0 },
    });
  }
  // События A экран B не перечитывают: ревизия прежняя.
  expect(b.client.region('main').view?.revision).toBe(1);

  // 3. next — тот же экран на месте (page: 1); prev — обратно.
  expect(await a.client.submit('main', 'next', {})).toMatchObject({
    kind: 'moved',
  });
  expect(a.client.region('main').view?.address).toEqual({
    screen: LIST_ID,
    params: { page: 1 },
  });
  expect(a.client.region('side').view).toBeUndefined();
  expect(a.text.page()).toContain('Сыр');
  await a.client.submit('main', 'prev', {});
  expect(a.client.region('main').view?.address).toEqual({
    screen: LIST_ID,
    params: { page: 0 },
  });

  // 4. Локальное toggle формой, «Выполнить выбранные» — подтверждение, «Да».
  await a.client.local('main', 'toggle', { taskId: 'Хлеб' });
  await a.client.local('main', 'toggle', { taskId: 'Молоко' });
  expect(a.client.region('main').view?.state).toEqual({
    selected: [expect.any(String), expect.any(String)],
  });
  expect(await a.client.submit('main', 'completeSelected', {})).toMatchObject({
    kind: 'confirm',
  });
  expect(a.client.region('main').confirm).toMatchObject({
    action: 'completeSelected',
  });
  expect(await a.client.confirm('main')).toMatchObject({ kind: 'stayed' });
  await settle(w);
  expect(records('completeTasks')).toMatchObject([
    { result: { ok: true }, events: [{}, {}] },
  ]);

  // 5. open «Сыр» — карточка в side; список остаётся в main: два экрана сразу.
  expect(
    await a.client.submit('main', 'open', { taskId: 'Сыр' }),
  ).toMatchObject({ kind: 'moved' });
  expect(a.client.region('side').view?.screen).toBe(CARD_ID);
  expect(a.client.region('side').view?.data).toMatchObject({
    title: 'Сыр',
    status: 'open',
  });
  expect(a.client.region('main').view?.screen).toBe(LIST_ID);

  // 6. A назначает Сыр на B в side. У B main перечитан сигналом по проводу,
  // во входящих — уведомление; ссылка открывается в side B.
  expect(
    await a.client.submit('side', 'assign', { assigneeId: B }),
  ).toMatchObject({ kind: 'stayed' });
  await settle(w);
  expect(a.client.region('side').view?.revision).toBe(2);
  expect(b.client.region('main').view?.revision).toBe(2);
  expect(b.client.region('main').view?.data).toMatchObject({
    tasks: [{ title: 'Сыр' }],
  });
  expect(b.client.inbox().get()).toStrictEqual([
    { notification: ASSIGNED_NOTE, data: { title: 'Сыр' }, links: [ASSIGNED] },
  ]);
  expect(b.text.page()).toContain('Входящие\n- Вам назначена задача: Сыр');
  const link = b.client.inbox().get()[0]?.links[0];
  if (link === undefined) throw new Error('в уведомлении нет ссылки');
  await b.client.openLink(link);
  await settle(w);
  expect(b.client.region('side').view?.screen).toBe(ASSIGNED_ID);
  expect(b.client.region('side').view?.data).toMatchObject({
    tasks: [{ title: 'Сыр' }],
  });
  expect(b.client.region('main').view?.screen).toBe(ASSIGNED_ID);

  // 7. A выполняет в side: список A в main перечитан своим событием,
  // B получил «Поручение выполнено».
  const before = a.client.region('main').view?.revision ?? 0;
  expect(await a.client.submit('side', 'complete', {})).toMatchObject({
    kind: 'stayed',
  });
  await settle(w);
  expect(a.client.region('side').view?.data).toMatchObject({ status: 'done' });
  expect(a.client.region('main').view?.revision).toBe(before + 1);
  expect(b.client.inbox().get()).toHaveLength(2);
  expect(b.client.inbox().get()[1]?.notification).toBe(COMPLETED_NOTE);
  expect(b.text.page()).toContain(
    'Входящие\n- Вам назначена задача: Сыр\n- Поручение выполнено: Сыр',
  );

  // 8. Форма списка по ревизии до перечитывания — stale, вид заново.
  expect(
    await a.client.submit('main', 'create', { title: 'Яйца' }, before),
  ).toMatchObject({ kind: 'stale' });
  expect(a.client.region('main').note).toBe('Данные обновились');
  expect(a.client.region('main').view?.revision).toBe(before + 1);
  expect(records('createTask')).toHaveLength(3);

  // Граница JSON: журнал — только строки, круг JSON без потерь; подписка
  // каждой загрузки — раньше её вызова.
  for (const { wire } of [a, b]) {
    for (const text of wire.messages) {
      expect(typeof text).toBe('string');
      const message: unknown = JSON.parse(text);
      expect(JSON.parse(JSON.stringify(message))).toStrictEqual(message);
    }
    const sent = clientSide(wire);
    sent.forEach((message, index) => {
      if (message.kind !== 'watch') return;
      const load = sent[index + 1];
      expect(load).toMatchObject({
        kind: 'call',
        call: { requestId: expect.any(String) },
      });
      expect(['listTasks', 'listAssignedTasks']).toContain(
        load?.kind === 'call' ? load.call.uc : '',
      );
    });
    expect(sent.some((m) => m.kind === 'watch')).toBe(true);
  }
  // Перечитывание B — вызов по eventId, пришедший по проводу сигналом.
  expect(
    clientSide(b.wire).some(
      (m) =>
        m.kind === 'call' &&
        'eventId' in m.call &&
        m.call.uc === 'listAssignedTasks',
    ),
  ).toBe(true);
  // Сигналы без payload, уведомления без trace и recipient.
  for (const { wire } of [a, b]) {
    for (const message of serverSide(wire)) {
      if (message.kind === 'signal') {
        expect(Object.keys(message).toSorted()).toEqual([
          'kind',
          'signal',
          'watch',
        ]);
        expect(Object.keys(message.signal).toSorted()).toEqual([
          'event',
          'eventId',
          'trace',
        ]);
      }
      if (message.kind === 'notification') {
        expect(Object.keys(message).toSorted()).toEqual([
          'data',
          'eventId',
          'kind',
          'links',
          'notification',
        ]);
      }
    }
  }
  expect(serverSide(a.wire).filter((m) => m.kind === 'notification')).toEqual(
    [],
  );
  expect(
    serverSide(b.wire).filter((m) => m.kind === 'notification'),
  ).toHaveLength(2);
  for (const message of serverSide(b.wire)) {
    if (message.kind === 'notification') {
      expect(JSON.stringify(message)).not.toContain('trace');
    }
  }

  // Лог операций: B читает от своего имени — по запросам открытия (main и
  // side) и по событиям с цепочкой запросов A; получатель — запрос системы;
  // `listTasks` B не звал совсем.
  const [assign] = records('assignTask');
  const [complete] = records('completeTask');
  expect(assign?.trace.correlationId).toMatch(/^a-\d+$/);
  expect(complete?.trace.correlationId).toMatch(/^a-\d+$/);
  expect(readsOf(records('listAssignedTasks'), B).toSorted()).toEqual(
    [
      'request:b-1',
      'request:b-2',
      `event:${assign?.trace.correlationId}`,
      `event:${assign?.trace.correlationId}`,
      `event:${complete?.trace.correlationId}`,
    ].toSorted(),
  );
  expect(readsOf(records('listTasks'), B)).toEqual([]);
  // Список A перечитан событием выполнения A.
  expect(readsOf(records('listTasks'), A)).toContain(
    `event:${complete?.trace.correlationId}`,
  );
  const assignee = records('getTaskAssignee');
  expect(assignee.length).toBeGreaterThan(0);
  expect(assignee.every((r) => r.caller.kind === 'system')).toBe(true);

  // Входящие: у A уведомлений нет, у B — ровно два.
  expect(a.client.inbox().get()).toEqual([]);
  expect(b.client.inbox().get()).toHaveLength(2);
});
