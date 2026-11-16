import { describe, expect, test } from 'bun:test';
import { DelegateCaller, ok, Trace } from 'dmg-core';
import {
  AwaitingBus,
  MemoryLogger,
  testUuid,
  useTempDir,
} from 'dmg-core/testing';
import {
  ExampleApp,
  type ExampleUser,
  TaskEvents,
} from 'dmg-core/testing/example';
import {
  ApiAppDispatch,
  type DeliveredNotification,
  type RecipientCallers,
  UiServer,
} from 'dmg-ui/server';
import { ExampleUiSetDef } from '../../example';
import { ExamplePagesAppDef } from '../../example/pages';
import { exampleUser, oplogRecords, T0 } from '../../ui-server-fixture';
import type { ServerMessage as ServerMsg } from '../wire/page-messages.types';
import type { ServerLink } from '../wire/page-wire.types';
import { PageHost } from './page-host';

// Серверная половина страничного канала на настоящем `UiServer`: соединение
// по токену, `hello` с контекстом рендера, `call`/`watch`/`unwatch`, мусор —
// `refused` без броска, доставка уведомлений без `trace` и `recipient`.
// Клиент — тест: строки JSON в `link.receive`, сообщения сервера — в `push`.

const A = testUuid(1);
const B = testUuid(2);
const LIST = { screen: 'exampleUi/todo/taskList', params: { page: 0 } };
const ASSIGNED = { screen: 'exampleUi/todo/assignedTasks', params: {} };
const TOKENS = new Map([
  ['tA', A],
  ['tB', B],
]);
const tmp = useTempDir('dmg-ui-page-host-');

type WorldSpec = {
  readonly identities?: RecipientCallers<ExampleUser>;
  readonly place?: { readonly locale: string; readonly timeZone: string };
};

const world = (spec: WorldSpec = {}) => {
  const bus = new AwaitingBus();
  const logger = new MemoryLogger();
  const context = { bus, logger };
  const example = new ExampleApp(
    { mode: 'test', dataDir: tmp().path, users: [A, B] },
    { ...context, clock: () => T0 },
  );
  const server = new UiServer({
    set: ExampleUiSetDef,
    dispatch: new ApiAppDispatch(example.api),
    context,
  });
  const host = new PageHost({
    app: ExamplePagesAppDef,
    server,
    tokens: (token) => TOKENS.get(token),
    identities: () => spec.identities ?? example.callers,
    logger,
    ...(spec.place === undefined ? {} : { place: spec.place }),
  });
  return { bus, logger, host };
};

type World = ReturnType<typeof world>;

/** Сообщения сервера одного соединения по порядку. */
class Pushed {
  readonly messages: ServerMsg[] = [];

  readonly push = (message: ServerMsg): void => {
    this.messages.push(message);
  };

  of(kind: ServerMsg['kind']): ServerMsg[] {
    return this.messages.filter((m) => m.kind === kind);
  }
}

const open = async (w: World, token: string) => {
  const pushed = new Pushed();
  const res = await w.host.connect(token, pushed.push);
  if (!res.ok) throw new Error(`connect(${token}): ожидалось соединение`);
  return { pushed, link: res.value };
};

const send = (link: ServerLink, message: unknown) =>
  link.receive(JSON.stringify(message));

const callOf = (id: string, uc: string, input: unknown, requestId: string) => ({
  kind: 'call',
  id,
  call: { module: 'todo', uc, input, requestId },
});

const records = (op: string) =>
  oplogRecords(tmp().path).filter((r) => r.op === op);

/** Всё, что сервер отправил, переживает круг JSON без потерь (`undefined`, `Date`). */
const expectJsonOnly = (messages: readonly ServerMsg[]) => {
  for (const message of messages) {
    expect(JSON.parse(JSON.stringify(message))).toStrictEqual(message);
  }
};

const assignedFor = (recipient: string, eventId: string) =>
  ({
    notification: 'exampleUi/todo/taskAssigned',
    recipient,
    data: { title: 'Сыр' },
    links: [ASSIGNED],
    cause: { event: TaskEvents.assigned.name, eventId },
    trace: Trace.fromEvent({
      eventId,
      correlationId: 'r-assign',
    }).toJSON(),
  }) satisfies DeliveredNotification;

describe('PageHost.connect — токен и hello', () => {
  test.each([
    ['неизвестный токен', 'чужой'],
    ['пустой токен', ''],
    ['токен длиннее 256 символов', 'x'.repeat(257)],
  ])('%s — err refused, соединения нет', async (_name, token) => {
    const w = world();
    const pushed = new Pushed();

    const res = await w.host.connect(token, pushed.push);

    expect(res).toEqual({ ok: false, error: 'refused' });
    expect(pushed.messages).toEqual([]);
  });

  test('известный токен — hello первым и один раз; контекст по умолчанию, без заместителя', async () => {
    const w = world();

    const { pushed } = await open(w, 'tA');

    expect(pushed.messages).toStrictEqual([
      {
        kind: 'hello',
        context: {
          locale: 'ru-RU',
          timeZone: 'Asia/Oral',
          delegate: false,
          readOnly: false,
        },
      },
    ]);
  });

  test('place канала — язык и пояс контекста в hello', async () => {
    const w = world({ place: { locale: 'kk-KZ', timeZone: 'Asia/Almaty' } });

    const { pushed } = await open(w, 'tA');

    expect(pushed.messages[0]).toMatchObject({
      kind: 'hello',
      context: { locale: 'kk-KZ', timeZone: 'Asia/Almaty' },
    });
  });

  test('заместитель только на чтение — признаки в hello, а команда всё равно отказана сервером', async () => {
    const w = world({
      identities: {
        resolve: async () =>
          ok(new DelegateCaller(exampleUser(A), exampleUser(B), 'd-1', true)),
      },
    });
    const { pushed, link } = await open(w, 'tA');

    await send(link, callOf('c1', 'createTask', { title: 'Хлеб' }, 'r-1'));

    expect(pushed.messages[0]).toMatchObject({
      kind: 'hello',
      context: { delegate: true, readOnly: true },
    });
    expect(pushed.of('result')).toMatchObject([
      { id: 'c1', result: { ok: false } },
    ]);
  });
});

describe('PageConnection — call', () => {
  test('объявленный UC исполняется от личности токена; след — запрос с requestId клиента', async () => {
    const w = world();
    const { pushed, link } = await open(w, 'tA');

    await send(link, callOf('c1', 'listTasks', {}, 'r-1'));

    expect(pushed.of('result')).toStrictEqual([
      { kind: 'result', id: 'c1', result: { ok: true, value: [] } },
    ]);
    expect(records('listTasks')).toMatchObject([
      {
        caller: { subjectId: A },
        trace: { cause: { kind: 'request' }, correlationId: 'r-1' },
      },
    ]);
  });

  test('UC, не объявленный сессией (getTaskAssignee) — OPERATION_NOT_FOUND с модулем и UC, UC не исполнен', async () => {
    const w = world();
    const { pushed, link } = await open(w, 'tA');

    await send(link, callOf('c1', 'getTaskAssignee', { taskId: A }, 'r-1'));

    expect(pushed.of('result')).toMatchObject([
      {
        id: 'c1',
        result: {
          ok: false,
          error: {
            code: 'OPERATION_NOT_FOUND',
            payload: { module: 'todo', uc: 'getTaskAssignee' },
          },
        },
      },
    ]);
    expect(records('getTaskAssignee')).toEqual([]);
  });
});

describe('PageConnection — мусор на входе (ERR-01)', () => {
  const valid = callOf('c1', 'listTasks', {}, 'r-1');
  const garbage: [string, string][] = [
    ['не JSON', '{не json'],
    ['число', '42'],
    ['null', 'null'],
    ['массив', '[]'],
    ['неизвестный kind', JSON.stringify({ kind: 'ping' })],
    ['лишнее поле сообщения', JSON.stringify({ ...valid, uuid: B })],
    [
      'след внутри вызова',
      JSON.stringify({ ...valid, call: { ...valid.call, trace: {} } }),
    ],
    [
      'вызывающий внутри вызова',
      JSON.stringify({ ...valid, call: { ...valid.call, caller: B } }),
    ],
    [
      'id длиннее 256 символов',
      JSON.stringify({ ...valid, id: 'x'.repeat(257) }),
    ],
  ];

  test.each(garbage)(
    '%s — один refused, без броска, UC не вызван',
    async (_n, raw) => {
      const w = world();
      const { pushed, link } = await open(w, 'tA');

      await link.receive(raw);

      expect(pushed.messages.slice(1)).toStrictEqual([
        { kind: 'refused', reason: expect.any(String) },
      ]);
      expect(records('listTasks')).toEqual([]);
    },
  );

  test('после мусора соединение работает', async () => {
    const w = world();
    const { pushed, link } = await open(w, 'tA');

    await link.receive('{не json');
    await send(link, valid);

    expect(pushed.of('result')).toMatchObject([
      { id: 'c1', result: { ok: true } },
    ]);
  });
});

describe('PageConnection — watch и unwatch', () => {
  test('своё событие — сигнал без payload: событие, eventId и обезличенный след', async () => {
    const w = world();
    const { pushed, link } = await open(w, 'tA');
    await send(link, { kind: 'watch', watch: 'w1', address: LIST });

    await send(link, callOf('c1', 'createTask', { title: 'Хлеб' }, 'r-1'));
    await w.bus.delivered();

    const [message] = pushed.of('signal');
    expect(message).toStrictEqual({
      kind: 'signal',
      watch: 'w1',
      signal: {
        event: TaskEvents.created.name,
        eventId: expect.any(String),
        trace: expect.any(Object),
      },
    });
    const text = JSON.stringify(message);
    expect(text).not.toContain('Хлеб');
    expect(text).not.toContain(A);
    if (message?.kind !== 'signal') throw new Error('нужен signal');
    const { eventId } = message.signal;
    expect(message.signal.trace).toStrictEqual({
      cause: { kind: 'event', eventId },
      correlationId: eventId,
    });
    expectJsonOnly(pushed.messages);
  });

  test('чужое событие — сигнала нет (сопоставление по субъекту сессии)', async () => {
    const w = world();
    const a = await open(w, 'tA');
    const b = await open(w, 'tB');
    await send(b.link, { kind: 'watch', watch: 'w1', address: LIST });

    await send(a.link, callOf('c1', 'createTask', { title: 'Хлеб' }, 'r-1'));
    await w.bus.delivered();

    expect(b.pushed.of('signal')).toEqual([]);
  });

  test('адрес не декодируется — watch-refused и warn без данных адреса, без броска', async () => {
    const w = world();
    const { pushed, link } = await open(w, 'tA');

    await send(link, {
      kind: 'watch',
      watch: 'w1',
      address: { screen: 'нет/такого/экрана', params: {} },
    });

    expect(pushed.messages.slice(1)).toStrictEqual([
      { kind: 'watch-refused', watch: 'w1' },
    ]);
    const warns = w.logger.records.filter((r) => r.level === 'warn');
    expect(warns.length).toBeGreaterThan(0);
    expect(warns.some((r) => r.message.includes('нет/такого/экрана'))).toBe(
      false,
    );
  });

  test('повтор id подписки — watch-refused, прежняя подписка жива', async () => {
    const w = world();
    const { pushed, link } = await open(w, 'tA');
    await send(link, { kind: 'watch', watch: 'w1', address: LIST });

    await send(link, { kind: 'watch', watch: 'w1', address: LIST });
    await send(link, callOf('c1', 'createTask', { title: 'Хлеб' }, 'r-1'));
    await w.bus.delivered();

    expect(pushed.of('watch-refused')).toStrictEqual([
      { kind: 'watch-refused', watch: 'w1' },
    ]);
    expect(pushed.of('signal')).toHaveLength(1);
  });

  test('unwatch — после него сигналов нет; неизвестный id — молча', async () => {
    const w = world();
    const { pushed, link } = await open(w, 'tA');
    await send(link, { kind: 'watch', watch: 'w1', address: LIST });

    await send(link, { kind: 'unwatch', watch: 'w1' });
    await send(link, { kind: 'unwatch', watch: 'нет-такой' });
    await send(link, callOf('c1', 'createTask', { title: 'Хлеб' }, 'r-1'));
    await w.bus.delivered();

    expect(pushed.of('signal')).toEqual([]);
    expect(pushed.messages.map((m) => m.kind)).toEqual(['hello', 'result']);
  });

  test('предел подписок — 64: шестьдесят пятая watch-refused', async () => {
    const w = world();
    const { pushed, link } = await open(w, 'tA');

    for (let n = 1; n <= 65; n += 1) {
      await send(link, { kind: 'watch', watch: `w${n}`, address: LIST });
    }

    expect(pushed.of('watch-refused')).toStrictEqual([
      { kind: 'watch-refused', watch: 'w65' },
    ]);
  });

  test('unwatch освобождает место под подписку', async () => {
    const w = world();
    const { pushed, link } = await open(w, 'tA');
    for (let n = 1; n <= 64; n += 1) {
      await send(link, { kind: 'watch', watch: `w${n}`, address: LIST });
    }

    await send(link, { kind: 'unwatch', watch: 'w1' });
    await send(link, { kind: 'watch', watch: 'w65', address: LIST });

    expect(pushed.of('watch-refused')).toEqual([]);
  });

  test('close — подписки сняты: события соединению больше не приходят', async () => {
    const w = world();
    const first = await open(w, 'tA');
    const second = await open(w, 'tA');
    await send(first.link, { kind: 'watch', watch: 'w1', address: LIST });

    first.link.close();
    await send(
      second.link,
      callOf('c1', 'createTask', { title: 'Хлеб' }, 'r-1'),
    );
    await w.bus.delivered();

    expect(first.pushed.of('signal')).toEqual([]);
  });
});

describe('PageDelivery', () => {
  test('notification — ровно {kind, notification, data, links, eventId}: без trace и recipient', async () => {
    const w = world();
    const b = await open(w, 'tB');

    await w.host.delivery.deliver(assignedFor(B, 'e-1'));

    expect(b.pushed.of('notification')).toStrictEqual([
      {
        kind: 'notification',
        notification: 'exampleUi/todo/taskAssigned',
        data: { title: 'Сыр' },
        links: [ASSIGNED],
        eventId: 'e-1',
      },
    ]);
    const text = JSON.stringify(b.pushed.of('notification'));
    expect(text).not.toContain('r-assign');
    expect(text).not.toContain(B);
    expectJsonOnly(b.pushed.messages);
  });

  test('все соединения получателя получают уведомление, чужие — нет', async () => {
    const w = world();
    const tab1 = await open(w, 'tB');
    const tab2 = await open(w, 'tB');
    const a = await open(w, 'tA');

    await w.host.delivery.deliver(assignedFor(B, 'e-1'));

    expect(tab1.pushed.of('notification')).toHaveLength(1);
    expect(tab2.pushed.of('notification')).toHaveLength(1);
    expect(a.pushed.of('notification')).toEqual([]);
  });

  test('у получателя нет соединения — не доставлено, без броска; позже подключившийся его не получает', async () => {
    const w = world();
    const a = await open(w, 'tA');

    await w.host.delivery.deliver(assignedFor(B, 'e-1'));
    const b = await open(w, 'tB');

    expect(a.pushed.of('notification')).toEqual([]);
    expect(b.pushed.of('notification')).toEqual([]);
  });

  test('закрытое соединение уведомлений не получает', async () => {
    const w = world();
    const b = await open(w, 'tB');

    b.link.close();
    await w.host.delivery.deliver(assignedFor(B, 'e-1'));

    expect(b.pushed.of('notification')).toEqual([]);
  });
});
