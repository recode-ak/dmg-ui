import { afterEach, describe, expect, test } from 'bun:test';
import {
  AwaitingBus,
  MemoryLogger,
  testTrace,
  testUuid,
  useTempDir,
} from 'dmg-core/testing';
import {
  CreateTaskUcDef,
  ExampleApp,
  TodoModuleDef,
} from 'dmg-core/testing/example';
import type { Place } from 'dmg-ui';
import {
  ApiAppDispatch,
  type PersonPlaces,
  UiNotifier,
  UiServer,
} from 'dmg-ui/server';
import {
  CARD_ID,
  ExampleUiSetDef,
  exampleCodes,
  LIST_ID,
  MemoryUiObserver,
} from 'dmg-ui/testing';
import { oplogRecords, T0 } from 'dmg-ui/testing/fixtures';
import {
  ExamplePagesAppDef,
  examplePageRoutes,
  ManualPageClock,
} from '../testing';
import { PageBrowserSocket } from './client/page-browser-socket';
import { PageClient } from './client/page-client';
import { PageReconnector } from './client/page-reconnector';
import type { PageSocket, PageSocketEvents } from './client/page-socket.types';
import { PageSocketEnd } from './client/page-socket-end';
import { PageGate } from './server/page-gate';
import { PageHost } from './server/page-host';
import { CONNECTION_LIMIT } from './server/page-server.const';
import type { PageAdmission } from './server/page-server.types';
import { PageSockets } from './server/page-sockets';
import type { PageViewState } from './view/page-view-state.types';
import type { ViewSource } from './view/view-source.types';
import type { ServerMessage as ServerMsg } from './wire/page-messages.types';
import { MAX_CLIENT_TEXT, MAX_SERVER_TEXT } from './wire/page-wire.const';

// Страничный канал на настоящем сокете Bun: ворота до открытия, мост сокета
// к хосту, конец сокета у клиента и адаптер сокета браузера. Проверяет
// привязку, личность по пропуску, освобождение на закрытии, пределы, которых
// не видят тесты в памяти, и переподключение после перезапуска сервера на
// том же порту. Сервер — `127.0.0.1` на свободном порту; ожидание — только
// событиями: источник области, закрытие на сервере и у клиента, обрыв, кадр;
// время переподключателя — подставные часы.

const A = testUuid(1);
const B = testUuid(2);
const ORIGIN = 'http://localhost:1';
const COOKIE = 'dmg_page';
const TOKENS = new Map([
  ['tA', A],
  ['tB', B],
]);
const PLACES = new Map<string, Place>([
  [A, { locale: 'kk-KZ', timeZone: 'Asia/Almaty' }],
  [B, { locale: 'ru-RU', timeZone: 'Asia/Oral' }],
]);
const LIST = { screen: LIST_ID, params: { page: 0 } };
const tmp = useTempDir('dmg-ui-page-socket-');

const stops: (() => Promise<void>)[] = [];

afterEach(async () => {
  await Promise.all(stops.splice(0).map((stop) => stop()));
});

/** Счёт закрытий на сервере: `reached(n)` — когда мост освободил n-й сокет. */
class ServerCloses {
  private count = 0;
  private readonly waiters: { n: number; resolve: () => void }[] = [];

  closed(): void {
    this.count += 1;
    for (const waiter of this.waiters.filter((w) => w.n <= this.count)) {
      waiter.resolve();
    }
  }

  reached(n: number): Promise<void> {
    if (n <= this.count) return Promise.resolve();
    return new Promise((resolve) => this.waiters.push({ n, resolve }));
  }
}

/** Приложение — учебное приложение, шина и логгер: переживает перезапуск сервера. */
const application = () => {
  const bus = new AwaitingBus();
  const logger = new MemoryLogger();
  const context = { bus, logger };
  const example = new ExampleApp(
    { mode: 'test', dataDir: tmp().path, users: [A, B] },
    { ...context, clock: () => T0 },
  );
  const dispatch = new ApiAppDispatch(example.api);
  return { bus, logger, context, example, dispatch };
};

type App = ReturnType<typeof application>;

/**
 * Сервер на порту над приложением: сервер UI, хост, уведомитель, мост, ворота
 * и сервер сокетов. `port` 0 — свободный; перезапуск — `stop()` и новый
 * сервер на прежнем `port`. Уведомитель остановленного сервера остаётся
 * подписан на шину и доставляет в пустую доставку.
 */
const serving = (
  app: App,
  {
    port = 0,
    tokens = TOKENS,
  }: { port?: number; tokens?: Map<string, string> } = {},
) => {
  const { context, dispatch, example, logger } = app;
  const server = new UiServer({ set: ExampleUiSetDef, dispatch, context });
  const places: PersonPlaces = {
    place: async (uuid) => {
      const place = PLACES.get(uuid);
      if (place === undefined) throw new Error(`места для ${uuid} нет`);
      return place;
    },
  };
  const host = new PageHost({
    app: ExamplePagesAppDef,
    server,
    tokens: async (token) => tokens.get(token),
    callers: example.callers,
    places,
    logger,
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
  const sockets = new PageSockets({ host, logger });
  const gate = new PageGate({ origins: [ORIGIN], cookie: COOKIE });
  const closes = new ServerCloses();
  const bun = Bun.serve<PageAdmission>({
    hostname: '127.0.0.1',
    port,
    fetch: (request, srv) => {
      const admitted = gate.admit(request.headers);
      if (!admitted.ok) return new Response(null, { status: 403 });
      return srv.upgrade(request, { data: admitted.value })
        ? undefined
        : new Response(null, { status: 400 });
    },
    websocket: {
      // Образец привязки: предел кадра — до 3 байт UTF-8 на символ строки
      // клиента (решает предел пакета); очередь отправки — не меньше трёх
      // строк сервера, при переполнении сокет закрывается, а не теряет кадры.
      maxPayloadLength: 3 * MAX_CLIENT_TEXT,
      backpressureLimit: 3 * MAX_SERVER_TEXT,
      closeOnBackpressureLimit: true,
      open: (ws) => sockets.open(ws),
      message: (ws, data) => sockets.message(ws, data),
      close: async (ws) => {
        await sockets.close(ws);
        closes.closed();
      },
    },
  });
  stops.push(() => bun.stop(true));
  const bound = bun.port ?? port;
  return {
    host,
    closes,
    port: bound,
    stop: () => bun.stop(true),
    url: `ws://127.0.0.1:${bound}`,
  };
};

type Served = ReturnType<typeof serving>;

/** Приложение и сервер на свободном порту. */
const world = () => {
  const app = application();
  return { ...app, ...serving(app) };
};

type World = ReturnType<typeof world>;

/** Заголовки запроса соединения: источник и cookie с пропуском. */
const headersFor = (token: string, origin = ORIGIN) => ({
  Origin: origin,
  Cookie: `${COOKIE}=${token}`,
});

/** Клиентский конец поверх настоящего сокета Bun. */
const endOf = (w: Served, headers: Record<string, string>) =>
  PageSocketEnd.connect(
    new PageBrowserSocket(new WebSocket(w.url, { headers })),
  );

/** Вкладка личности: клиент на конце сокета; обрыв — журнал и промис первого. */
const tab = async (w: Served, token: string, prefix: string) => {
  const res = await endOf(w, headersFor(token));
  if (!res.ok) throw new Error(`connect(${token}): отказ`);
  const end = res.value;
  const breaks: Error[] = [];
  const broken = Promise.withResolvers<void>();
  end.onBreak((error) => {
    breaks.push(error);
    broken.resolve();
  });
  let requests = 0;
  const client = new PageClient({
    app: ExamplePagesAppDef,
    codes: exampleCodes(),
    routes: examplePageRoutes,
    end,
    observer: new MemoryUiObserver(),
    requestIds: () => {
      requests += 1;
      return `${prefix}-${requests}`;
    },
  });
  return { end, client, breaks, broken: broken.promise };
};

/**
 * Сокеты вкладки поверх настоящего сокета Bun: счёт созданных и ожидание
 * закрытия n-го — по событию сокета, после реакции конца на него.
 */
class TabSockets {
  count = 0;
  private closedCount = 0;
  private readonly waiters: { n: number; resolve: () => void }[] = [];

  constructor(
    private readonly url: () => string,
    private readonly headers: Record<string, string>,
  ) {}

  next(): PageSocket {
    this.count += 1;
    const socket = new PageBrowserSocket(
      new WebSocket(this.url(), { headers: this.headers }),
    );
    return {
      send: (text) => socket.send(text),
      close: () => socket.close(),
      listen: (events: PageSocketEvents) =>
        socket.listen({
          message: (data) => events.message(data),
          closed: (code) => {
            events.closed(code);
            this.closed();
          },
        }),
    };
  }

  /** Закрыт n-й по счёту сокет вкладки. */
  reached(n: number): Promise<void> {
    if (n <= this.closedCount) return Promise.resolve();
    return new Promise((resolve) => this.waiters.push({ n, resolve }));
  }

  private closed(): void {
    this.closedCount += 1;
    for (const waiter of this.waiters.filter((w) => w.n <= this.closedCount)) {
      waiter.resolve();
    }
  }
}

/** Отдаёт микрозадачи без таймеров (TST-04). */
const flush = async () => {
  for (let turn = 0; turn < 200; turn += 1) await Promise.resolve();
};

/**
 * Вкладка личности через переподключатель: подставные часы, разброс 0;
 * обрыв — попытки к серверу на прежнем адресе, новый конец — `attach`.
 */
const reconnecting = async (w: Served, token: string, prefix: string) => {
  const clock = new ManualPageClock();
  const sockets = new TabSockets(() => w.url, headersFor(token));
  const reconnector = new PageReconnector({
    sockets: () => sockets.next(),
    clock,
    random: () => 0,
  });
  stops.push(async () => reconnector.close());
  const end = await reconnector.connect();
  let requests = 0;
  const client = new PageClient({
    app: ExamplePagesAppDef,
    codes: exampleCodes(),
    routes: examplePageRoutes,
    end,
    observer: new MemoryUiObserver(),
    clock,
    requestIds: () => {
      requests += 1;
      return `${prefix}-${requests}`;
    },
  });
  reconnector.follow(end, (next) => client.attach(next));
  return { client, clock, sockets };
};

/** Задача A, созданная через приложение, мимо сервера страниц. */
const createdByA = async (app: App, title: string) => {
  const caller = await app.example.callers.resolve(A, testTrace());
  if (!caller.ok) throw new Error('вызывающий A не найден');
  const result = await app.example.api.dispatch(
    TodoModuleDef,
    CreateTaskUcDef.command({ title }),
    caller.value,
    testTrace(),
  );
  if (!result.ok) throw new Error('createTask: отказ');
  await app.bus.delivered();
};

/** Первое состояние источника, для которого `predicate` истинен. */
const until = (
  source: ViewSource<PageViewState>,
  predicate: (state: PageViewState) => boolean,
) =>
  new Promise<PageViewState>((resolve) => {
    let done = false;
    let off: () => void = () => {};
    off = source.subscribe((state) => {
      if (done || !predicate(state)) return;
      done = true;
      resolve(state);
      off();
    });
    if (done) off();
  });

/** Задача с заголовком `title` — в данных вида области. */
const shows = (state: PageViewState, title: string) =>
  JSON.stringify(state.view?.data ?? null).includes(`"${title}"`);

/** Сырой клиент: кадры сервера по порядку, ожидание кадра — по `onmessage`. */
class RawClient {
  readonly frames: ServerMsg[] = [];
  private readonly waiters: {
    predicate: (message: ServerMsg) => boolean;
    resolve: (message: ServerMsg) => void;
  }[] = [];

  constructor(readonly ws: WebSocket) {
    ws.onmessage = (event) => {
      const message: ServerMsg = JSON.parse(String(event.data));
      this.frames.push(message);
      for (const waiter of [...this.waiters]) {
        if (!waiter.predicate(message)) continue;
        this.waiters.splice(this.waiters.indexOf(waiter), 1);
        waiter.resolve(message);
      }
    };
  }

  until(predicate: (message: ServerMsg) => boolean): Promise<ServerMsg> {
    const seen = this.frames.find(predicate);
    if (seen !== undefined) return Promise.resolve(seen);
    return new Promise((resolve) => this.waiters.push({ predicate, resolve }));
  }

  send(message: unknown): void {
    this.ws.send(JSON.stringify(message));
  }
}

/** Сырой клиент после `hello`. */
const rawOf = async (w: World, token: string) => {
  const raw = new RawClient(
    new WebSocket(w.url, { headers: headersFor(token) }),
  );
  await raw.until((m) => m.kind === 'hello');
  return raw;
};

const resultOf = (id: string) => (m: ServerMsg) =>
  m.kind === 'result' && m.id === id;

const listCall = (id: string) => ({
  kind: 'call',
  id,
  call: { module: 'todo', uc: 'listTasks', input: {}, requestId: `r-${id}` },
});

const records = (op: string) =>
  oplogRecords(tmp().path).filter((r) => r.op === op);

describe('страничный канал на сокете — личность', () => {
  test('A на своём соединении при B на соседнем: экран A готов, место A в контексте, задача записана от A', async () => {
    const w = world();
    const a = await tab(w, 'tA', 'a');
    const b = await tab(w, 'tB', 'b');
    await b.client.route('/assigned');

    await a.client.route('/');
    await a.client.submit('main', 'create', { title: 'Хлеб' });
    await w.bus.delivered();

    expect(a.end.context).toMatchObject({
      locale: 'kk-KZ',
      timeZone: 'Asia/Almaty',
    });
    expect(b.end.context).toMatchObject({ locale: 'ru-RU' });
    expect(a.client.region('main').status).toBe('ready');
    expect(records('createTask')).toMatchObject([{ caller: { subjectId: A } }]);
  });

  test.each([
    ['чужой Origin', 'closed', headersFor('tA', 'http://evil.example')],
    ['без Origin', 'closed', { Cookie: `${COOKIE}=tA` }],
    ['неизвестный токен', 'refused', headersFor('unknown-token')],
  ] satisfies [string, 'closed' | 'refused', Record<string, string>][])(
    '%s — connect %s, соединений A нет',
    async (_name, error, headers) => {
      const w = world();

      const res = await endOf(w, headers);

      expect(res).toEqual({ ok: false, error });
      expect(w.host.delivery.connections(A)).toBe(0);
    },
  );
});

describe('страничный канал на сокете — перечитывание', () => {
  test('событие одного перечитывает экран другого: A назначает задачу на B, экран B доходит до ревизии 2', async () => {
    const w = world();
    const a = await tab(w, 'tA', 'a');
    const b = await tab(w, 'tB', 'b');
    await b.client.route('/assigned');
    expect(b.client.region('main').view?.revision).toBe(1);
    await a.client.route('/');
    await a.client.submit('main', 'create', { title: 'Сыр' });
    await until(a.client.source('main'), (s) => shows(s, 'Сыр'));
    await a.client.submit('main', 'open', { taskId: 'Сыр' });
    expect(a.client.region('side').view?.screen).toBe(CARD_ID);

    await a.client.submit('side', 'assign', { assigneeId: B });
    const reread = await until(
      b.client.source('main'),
      (s) => s.view?.revision === 2,
    );

    expect(reread.view?.data).toMatchObject({ tasks: [{ title: 'Сыр' }] });
  });

  test('чужой не перечитывается: у B после события A ответ на свой call — без сигнала до него', async () => {
    const w = world();
    const a = await tab(w, 'tA', 'a');
    const raw = await rawOf(w, 'tB');
    raw.send({ kind: 'watch', watch: 'w1', address: LIST });
    raw.send(listCall('c0'));
    await raw.until(resultOf('c0'));

    await a.client.route('/');
    await a.client.submit('main', 'create', { title: 'Хлеб' });
    await w.bus.delivered();
    raw.send(listCall('c1'));
    await raw.until(resultOf('c1'));

    // Кадры одного соединения идут по порядку: сигнал, отправленный при
    // доставке события, пришёл бы раньше ответа на `c1`.
    expect(raw.frames.map((m) => m.kind)).toEqual([
      'hello',
      'result',
      'result',
    ]);
  });
});

describe('страничный канал на сокете — обрыв', () => {
  test('клиент закрыл — после закрытия на сервере его соединения нет, событие A другой вкладкой проходит без ошибок', async () => {
    const w = world();
    const first = await tab(w, 'tA', 'a1');
    const second = await tab(w, 'tA', 'a2');
    await first.client.route('/');
    await second.client.route('/');
    expect(w.host.delivery.connections(A)).toBe(2);

    first.end.close();
    await w.closes.reached(1);
    expect(w.host.delivery.connections(A)).toBe(1);
    expect(
      await second.client.submit('main', 'create', { title: 'Хлеб' }),
    ).toMatchObject({ kind: 'exited' });
    await w.bus.delivered();
    second.end.close();
    await w.closes.reached(2);

    expect(w.host.delivery.connections(A)).toBe(0);
    expect(w.logger.records.filter((r) => r.level === 'error')).toEqual([]);
  });

  test(`соединений A — ${CONNECTION_LIMIT}: следующее refused; одно закрыто — следующее принято`, async () => {
    const w = world();
    const ends = [];
    for (let n = 0; n < CONNECTION_LIMIT; n += 1) {
      const res = await endOf(w, headersFor('tA'));
      if (!res.ok) throw new Error(`соединение ${n + 1}: отказ`);
      ends.push(res.value);
    }

    const extra = await endOf(w, headersFor('tA'));
    await w.closes.reached(1);
    ends[0]?.close();
    await w.closes.reached(2);
    const again = await endOf(w, headersFor('tA'));

    expect(extra).toEqual({ ok: false, error: 'refused' });
    expect(again.ok).toBe(true);
    expect(w.host.delivery.connections(A)).toBe(CONNECTION_LIMIT);
  });

  test('остановка сервера — обрыв у клиента один раз, ожидающий вызов отказан', async () => {
    const w = world();
    const a = await tab(w, 'tA', 'a');
    await a.client.route('/');

    const pending = a.client.submit('main', 'create', { title: 'Хлеб' });
    void w.stop();
    await a.broken;

    expect(await pending).toMatchObject({ kind: 'refused' });
    expect(a.breaks).toHaveLength(1);
  });
});

describe('страничный канал на сокете — пределы и лог', () => {
  test('кадр клиента длиннее MAX_CLIENT_TEXT — refused too-large, следующий call получил result', async () => {
    const w = world();
    const raw = await rawOf(w, 'tA');

    raw.ws.send('x'.repeat(MAX_CLIENT_TEXT + 1));
    const refused = await raw.until((m) => m.kind === 'refused');
    raw.send(listCall('c1'));
    const result = await raw.until(resultOf('c1'));

    expect(refused).toStrictEqual({ kind: 'refused', reason: 'too-large' });
    expect(result).toMatchObject({ result: { ok: true } });
  });

  test('в логе нет пропуска, Origin и входа вызова', async () => {
    const w = world();
    const guardToken = 'guard-token-7f3a9c';
    const guardOrigin = 'http://guard-origin.example';
    const guardInput = 'страж-входа';
    await endOf(w, headersFor(guardToken));
    await endOf(w, headersFor('tA', guardOrigin));
    const a = await tab(w, 'tA', 'a');
    await a.client.route('/');
    await a.client.submit('main', 'create', { title: guardInput });
    await w.bus.delivered();
    const raw = await rawOf(w, 'tA');

    raw.ws.send(`{не json ${guardInput}`);
    await raw.until((m) => m.kind === 'refused');

    expect(w.logger.records.filter((r) => r.level === 'warn')).not.toEqual([]);
    const text = JSON.stringify(w.logger.records);
    for (const guard of [guardToken, guardOrigin, ORIGIN, guardInput]) {
      expect(text).not.toContain(guard);
    }
  });
});

describe('страничный канал на сокете — перезапуск сервера', () => {
  test('перезапуск на том же порту: у A пометка «нет связи»; после переподключения список перечитан с задачей, созданной без связи', async () => {
    const app = application();
    const first = serving(app);
    const a = await reconnecting(first, 'tA', 'a');
    await a.client.route('/');
    expect(a.client.region('main').view?.revision).toBe(1);

    await first.stop();
    await until(a.client.source('main'), (s) => s.stale === 'offline');
    await createdByA(app, 'Сыр');
    serving(app, { port: first.port });
    expect(a.clock.pending()).toEqual([250]);
    a.clock.advance(250);
    const reread = await until(
      a.client.source('main'),
      (s) => s.stale === undefined && s.view?.revision === 2 && shows(s, 'Сыр'),
    );

    expect(reread).toMatchObject({ status: 'ready', refreshing: false });
    expect(a.sockets.count).toBe(2);
  });

  test('подписка на новом сервере: после перезапуска B назначает задачу на A — экран A перечитан по новому соединению', async () => {
    const app = application();
    const first = serving(app);
    const a = await reconnecting(first, 'tA', 'a');
    await a.client.route('/assigned');
    await first.stop();
    await until(a.client.source('main'), (s) => s.stale === 'offline');
    const second = serving(app, { port: first.port });
    a.clock.advance(250);
    await until(
      a.client.source('main'),
      (s) => s.stale === undefined && s.view?.revision === 2,
    );

    const b = await tab(second, 'tB', 'b');
    await b.client.route('/');
    await b.client.submit('main', 'create', { title: 'Сыр' });
    await until(b.client.source('main'), (s) => shows(s, 'Сыр'));
    await b.client.submit('main', 'open', { taskId: 'Сыр' });
    await b.client.submit('side', 'assign', { assigneeId: A });
    const reread = await until(a.client.source('main'), (s) => shows(s, 'Сыр'));

    expect(reread.view?.revision).toBeGreaterThan(2);
    expect(reread.stale).toBeUndefined();
  });

  test('новый сервер не знает пропуск A — отказ 4403: одна пауза не меньше 15 000 мс, новых сокетов нет', async () => {
    const app = application();
    const first = serving(app);
    const a = await reconnecting(first, 'tA', 'a');
    await a.client.route('/');
    await first.stop();
    await until(a.client.source('main'), (s) => s.stale === 'offline');
    serving(app, { port: first.port, tokens: new Map([['tB', B]]) });

    a.clock.advance(250);
    await a.sockets.reached(2);
    await flush();

    const pending = a.clock.pending();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toBeGreaterThanOrEqual(15_000);
    expect(a.sockets.count).toBe(2);
    expect(a.client.region('main').stale).toBe('offline');
  });
});
