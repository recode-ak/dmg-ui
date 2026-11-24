import { afterEach, describe, expect, test } from 'bun:test';
import { MemoryLogger, useTempDir } from 'dmg-core/testing';
import {
  ASSIGNED_ID,
  AssignedTasksScreenDef,
  exampleCodes,
  LIST_ID,
  MemoryUiObserver,
} from 'dmg-ui/testing';
import {
  PageBrowserSocket,
  PageClient,
  type PageHistoryPort,
  type PageInboxEntry,
  PageReconnector,
  PageSocketEnd,
  type PageViewState,
  type ViewSource,
} from 'dmg-ui/web-ui';
import {
  ExamplePagesUiAppDef,
  examplePagesRoutes,
  exampleSubjectWire,
  ManualPageClock,
  MemoryPageHistory,
} from 'dmg-ui/web-ui/testing';
import * as v from 'valibot';
import { EXAMPLE_PEOPLE } from '../common/example-people.const';
import { EXAMPLE_COOKIE, EXAMPLE_PATHS } from '../common/example-web.const';
import { ExampleGestures } from '../view/example-gestures';
import { exampleWebViews } from '../view/example-web.views';
import { InboxModel } from '../view/inbox-model';
import { ExampleWebServer } from './example-web-server';

// Сквозной сценарий примера на настоящем сокете (TST-09): Анна и Борис, вход
// по пропуску, задачи, назначение, уведомления, окно по ссылке записи; откат
// показа до ответа при «медленном сервере» — по отказу и по обрыву. Ожидание
// только событиями: состояние области, входящие, закрытие; «медленный сервер» —
// порт `wait` с удержанием.

const tmp = useTempDir('example-web-story-');
const stops: (() => Promise<void>)[] = [];

afterEach(async () => {
  await Promise.all(stops.splice(0).map((stop) => stop()));
});

type Started = Awaited<ReturnType<typeof ExampleWebServer.start>>;

const personOf = (key: string) => {
  const found = EXAMPLE_PEOPLE.find((candidate) => candidate.key === key);
  if (found === undefined) throw new Error(`нет человека ${key}`);
  return found;
};

/** Сервер примера; `wait` — порт «медленного сервера». */
const start = async (
  spec: {
    port?: number;
    delayMs?: number;
    wait?: (ms: number) => Promise<void>;
  } = {},
): Promise<Started> => {
  const server = await ExampleWebServer.start({
    port: spec.port ?? 0,
    dataDir: tmp().path,
    delayMs: spec.delayMs ?? 0,
    logger: new MemoryLogger(),
    ...(spec.wait === undefined ? {} : { wait: spec.wait }),
  });
  stops.push(() => server.stop());
  return server;
};

/** Вход человека: пропуск из `Set-Cookie` ответа `POST /_enter/<ключ>`. */
const passOf = async (s: Started, key: string): Promise<string> => {
  const response = await fetch(
    `http://127.0.0.1:${s.port}${EXAMPLE_PATHS.enter}${key}`,
    {
      method: 'POST',
      headers: { Origin: s.origins[0] ?? '' },
      redirect: 'manual',
    },
  );
  const token = (response.headers.getSetCookie()[0] ?? '').match(
    new RegExp(`^${EXAMPLE_COOKIE}=([^;]*)`),
  )?.[1];
  if (token === undefined) throw new Error(`вход ${key}: пропуска нет`);
  return token;
};

const url = (s: Started) => `ws://127.0.0.1:${s.port}${EXAMPLE_PATHS.socket}`;

const headersOf = (s: Started, token: string) => ({
  Origin: s.origins[0] ?? '',
  Cookie: `${EXAMPLE_COOKIE}=${token}`,
});

const PLACEMENTS = [
  { screen: AssignedTasksScreenDef, region: 'modal' },
] as const;

/** Вкладка человека на настоящем сокете; история — по желанию. */
const tab = async (
  s: Started,
  key: string,
  prefix: string,
  history?: PageHistoryPort,
) => {
  const token = await passOf(s, key);
  const res = await PageSocketEnd.connect(
    new PageBrowserSocket(
      new WebSocket(url(s), { headers: headersOf(s, token) }),
    ),
  );
  if (!res.ok) throw new Error(`соединение ${key}: отказ`);
  let n = 0;
  const client = new PageClient({
    app: ExamplePagesUiAppDef,
    codes: exampleCodes({}, ExamplePagesUiAppDef),
    routes: examplePagesRoutes,
    end: res.value,
    placements: PLACEMENTS,
    observer: new MemoryUiObserver(),
    reviveSubject: exampleSubjectWire.revive,
    requestIds: () => {
      n += 1;
      return `${prefix}-${n}`;
    },
    ...(history === undefined ? {} : { history }),
  });
  return { client, gestures: new ExampleGestures(client, () => {}) };
};

/** Вкладка через переподключатель и подставные часы: переживает перезапуск сервера на том же порту. */
const reconnecting = async (s: Started, key: string, prefix: string) => {
  const token = await passOf(s, key);
  const clock = new ManualPageClock();
  const reconnector = new PageReconnector({
    sockets: () =>
      new PageBrowserSocket(
        new WebSocket(url(s), { headers: headersOf(s, token) }),
      ),
    clock,
    random: () => 0,
  });
  stops.push(async () => reconnector.close());
  const end = await reconnector.connect();
  let n = 0;
  const client = new PageClient({
    app: ExamplePagesUiAppDef,
    codes: exampleCodes({}, ExamplePagesUiAppDef),
    routes: examplePagesRoutes,
    end,
    placements: PLACEMENTS,
    observer: new MemoryUiObserver(),
    clock,
    reviveSubject: exampleSubjectWire.revive,
    requestIds: () => {
      n += 1;
      return `${prefix}-${n}`;
    },
  });
  reconnector.follow(end, (next) => client.attach(next));
  return { client, clock, gestures: new ExampleGestures(client, () => {}) };
};

/** Первое значение источника, для которого `predicate` истинен. */
const until = <T>(source: ViewSource<T>, predicate: (value: T) => boolean) =>
  new Promise<T>((resolve) => {
    let done = false;
    let off: () => void = () => {};
    off = source.subscribe((value) => {
      if (done || !predicate(value)) return;
      done = true;
      resolve(value);
      off();
    });
    if (done) off();
  });

const Tasks = v.object({
  tasks: v.array(
    v.object({ uuid: v.string(), title: v.string(), status: v.string() }),
  ),
});

const tasksOf = (state: PageViewState) =>
  v.parse(Tasks, state.view?.data).tasks;

const statusOf = (state: PageViewState): unknown =>
  v.parse(v.object({ status: v.string() }), state.view?.data).status;

const revisionOf = (state: PageViewState): number => {
  const revision = state.view?.revision;
  if (revision === undefined) throw new Error('нет вида');
  return revision;
};

const titles = (state: PageViewState) =>
  tasksOf(state).map((task) => task.title);

/** «Медленный сервер» с удержанием: `arm()` — следующая ждущая команда держится до `release()`. */
const slow = () => {
  const waits: number[] = [];
  let armed = false;
  let called = Promise.withResolvers<void>();
  const gate = Promise.withResolvers<void>();
  return {
    waits,
    wait: (ms: number): Promise<void> => {
      if (!armed) return Promise.resolve();
      armed = false;
      waits.push(ms);
      called.resolve();
      return gate.promise;
    },
    arm: () => {
      armed = true;
      called = Promise.withResolvers<void>();
    },
    held: () => called.promise,
    release: () => gate.resolve(),
  };
};

describe('сквозной сценарий: Анна и Борис на настоящем сокете', () => {
  test('создание, назначение, входящие Бориса, окно по ссылке, выполнение и повторное открытие', async () => {
    const s = await start();
    const a = await tab(s, 'anna', 'a');
    const b = await tab(s, 'boris', 'b');
    await a.client.route('/');
    await b.client.route('/assigned');

    expect(tasksOf(a.client.region('main'))).toEqual([]);
    expect(tasksOf(b.client.region('main'))).toEqual([]);

    const created = await a.gestures.submitForm('main', 'create', {
      title: 'Хлеб',
    });
    expect(created).toMatchObject({ kind: 'exited', exit: 'created' });
    expect(a.client.region('main').note).toBe('Задача создана');
    expect(titles(a.client.region('main'))).toEqual(['Хлеб']);

    const row = tasksOf(a.client.region('main'))[0];
    if (row === undefined) throw new Error('нет строки');
    await a.gestures.openTask(row.uuid, revisionOf(a.client.region('main')));
    await a.gestures.submitForm('side', 'assign', {
      assigneeId: personOf('boris').uuid,
    });

    // Событие одного перечитывает экран другого без действия Бориса.
    const reread = await until(
      b.client.source('main'),
      (state) => state.view?.revision === 2,
    );
    expect(titles(reread)).toEqual(['Хлеб']);

    const entries = await until(
      b.client.inbox(),
      (list: readonly PageInboxEntry[]) => list.length >= 1,
    );
    const first = InboxModel.of(entries, exampleWebViews)[0];
    expect(first?.text).toBe('Вам назначена задача: Хлеб');
    const link = first?.links[0];
    expect(link).toEqual({ screen: ASSIGNED_ID, params: {} });
    if (link === undefined) throw new Error('нет ссылки');

    await b.gestures.openLink(link);
    expect(b.client.region('modal').view?.screen).toBe(ASSIGNED_ID);
    expect(titles(b.client.region('modal'))).toEqual(['Хлеб']);

    const done = await a.gestures.completeTask(
      'side',
      revisionOf(a.client.region('side')),
    );
    expect(done).toMatchObject({ kind: 'stayed' });
    const both = await until(
      b.client.inbox(),
      (list: readonly PageInboxEntry[]) => list.length >= 2,
    );
    expect(InboxModel.of(both, exampleWebViews)[1]?.text).toBe(
      'Поручение выполнено: Хлеб',
    );

    // Экран исполнителя перечитывают только назначение и снятие: открытый
    // остаётся прежним, повторное открытие по ссылке показывает «выполнена».
    await b.gestures.openLink(link);
    expect(tasksOf(b.client.region('modal'))[0]?.status).toBe('done');
    expect(revisionOf(b.client.region('main'))).toBe(2);
    expect(tasksOf(b.client.region('main'))[0]?.status).toBe('open');
  });

  test('у Анны чужих записей нет: назначение и выполнение уходят исполнителю', async () => {
    const s = await start();
    const a = await tab(s, 'anna', 'a');
    const b = await tab(s, 'boris', 'b');
    await a.client.route('/');
    await b.client.route('/assigned');
    await a.gestures.submitForm('main', 'create', { title: 'Хлеб' });
    const row = tasksOf(a.client.region('main'))[0];
    if (row === undefined) throw new Error('нет строки');
    await a.gestures.openTask(row.uuid, revisionOf(a.client.region('main')));
    await a.gestures.submitForm('side', 'assign', {
      assigneeId: personOf('boris').uuid,
    });
    await until(b.client.inbox(), (list) => list.length >= 1);

    expect(a.client.inbox().get()).toEqual([]);
    expect(a.client.region('main').view?.screen).toBe(LIST_ID);
  });

  test('две вкладки Анны: создание в одной видно в другой без действия', async () => {
    const s = await start();
    const first = await tab(s, 'anna', 'a1');
    const second = await tab(s, 'anna', 'a2');
    await first.client.route('/');
    await second.client.route('/');

    await first.gestures.submitForm('main', 'create', { title: 'Сыр' });

    const seen = await until(second.client.source('main'), (state) =>
      titles(state).includes('Сыр'),
    );
    expect(titles(seen)).toEqual(['Сыр']);
  });

  test('«Назад» на подставной истории при открытой панели закрывает её', async () => {
    const s = await start();
    const history = new MemoryPageHistory('/');
    const a = await tab(s, 'anna', 'a', history);
    await a.client.boot();
    await a.gestures.submitForm('main', 'create', { title: 'Хлеб' });
    const row = tasksOf(a.client.region('main'))[0];
    if (row === undefined) throw new Error('нет строки');
    await a.gestures.openTask(row.uuid, revisionOf(a.client.region('main')));
    expect(a.client.region('side').status).toBe('ready');

    await history.back();

    expect(a.client.region('side').status).toBe('empty');
    expect(a.client.region('main').view?.screen).toBe(LIST_ID);
  });
});

describe('«медленный сервер»: откат показа до ответа', () => {
  /** Анна в двух вкладках с открытой карточкой «Хлеб»; первой задержка выполнения готова. */
  const ready = async (s: Started) => {
    const first = await tab(s, 'anna', 'a1');
    const second = await tab(s, 'anna', 'a2');
    await first.client.route('/');
    await second.client.route('/');
    await first.gestures.submitForm('main', 'create', { title: 'Хлеб' });
    await until(second.client.source('main'), (state) =>
      titles(state).includes('Хлеб'),
    );
    for (const t of [first, second]) {
      const row = tasksOf(t.client.region('main'))[0];
      if (row === undefined) throw new Error('нет строки');
      await t.gestures.openTask(row.uuid, revisionOf(t.client.region('main')));
    }
    return { first, second };
  };

  test('по отказу: показ сразу «выполнена» с ожиданием; вторая вкладка выполнила раньше — после отпускания наложения нет, заметка отказа, данные сервера «выполнена»', async () => {
    const delay = slow();
    const s = await start({ delayMs: 6000, wait: delay.wait });
    const { first, second } = await ready(s);
    const log: PageViewState[] = [];
    first.client.source('side').subscribe((state) => log.push(state));
    delay.arm();

    const acting = first.gestures.completeTask(
      'side',
      revisionOf(first.client.region('side')),
    );

    expect(first.client.region('side').expected).toBe(true);
    expect(statusOf(first.client.region('side'))).toBe('done');
    await delay.held();
    const other = await second.client.submit('side', 'complete', {});
    expect(other).toMatchObject({ kind: 'stayed' });
    delay.release();
    const outcome = await acting;

    expect(delay.waits).toEqual([6000]);
    expect(outcome).toMatchObject({ kind: 'refused' });
    const state = await until(
      first.client.source('side'),
      (value) => value.expected === undefined && statusOf(value) === 'done',
    );
    expect(state.note).toBeTruthy();
    expect(
      log.some((entry) => entry.expected === true && entry.note !== undefined),
    ).toBe(false);
  });

  test('по обрыву: сервер остановлен во время задержки — сразу нет связи, показ снят, «открыта»; после запуска на том же порту и каталоге пропуск годен, экран перечитан, команда не исполнена', async () => {
    const delay = slow();
    const dir = tmp().path;
    const first = await ExampleWebServer.start({
      port: 0,
      dataDir: dir,
      delayMs: 6000,
      logger: new MemoryLogger(),
      wait: delay.wait,
    });
    stops.push(() => first.stop());
    const a = await reconnecting(first, 'anna', 'a');
    await a.client.route('/');
    await a.gestures.submitForm('main', 'create', { title: 'Хлеб' });
    const row = tasksOf(a.client.region('main'))[0];
    if (row === undefined) throw new Error('нет строки');
    await a.gestures.openTask(row.uuid, revisionOf(a.client.region('main')));
    delay.arm();

    const acting = a.gestures.completeTask(
      'side',
      revisionOf(a.client.region('side')),
    );
    expect(a.client.region('side').expected).toBe(true);
    await delay.held();
    // Остановка задержанного вызова не дожидается: удержанный `wait` не отпускается.
    await first.stop();
    const offline = await until(
      a.client.source('side'),
      (state) => state.stale === 'offline',
    );

    expect(offline.expected).toBeUndefined();
    expect(statusOf(offline)).toBe('open');
    expect(await acting).toMatchObject({ kind: 'refused' });

    const second = await ExampleWebServer.start({
      port: first.port,
      dataDir: dir,
      delayMs: 0,
      logger: new MemoryLogger(),
    });
    stops.push(() => second.stop());
    a.clock.advance(250);
    const reread = await until(
      a.client.source('side'),
      (state) =>
        state.stale === undefined &&
        state.status === 'ready' &&
        state.expected === undefined,
    );

    expect(statusOf(reread)).toBe('open');
  });
});
