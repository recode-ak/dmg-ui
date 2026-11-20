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
import type { Place } from 'dmg-ui';
import {
  ApiAppDispatch,
  type DeliveredNotification,
  type PersonPlaces,
  type RecipientCallers,
  UiServer,
} from 'dmg-ui/server';
import { ExampleUiSetDef } from 'dmg-ui/testing';
import { exampleUser, oplogRecords, T0 } from 'dmg-ui/testing/fixtures';
import { ExamplePagesUiAppDef } from '../../testing';
import { PAGE_CHANNEL } from '../page-channel.const';
import type { ServerMessage as ServerMsg } from '../wire/page-messages.types';
import { MAX_CLIENT_TEXT, MAX_SERVER_TEXT } from '../wire/page-wire.const';
import type { ServerLink } from '../wire/page-wire.types';
import { PageHost } from './page-host';
import {
  CALL_LIMIT,
  CONNECTION_LIMIT,
  HOST_LOGS,
  WATCH_LIMIT,
} from './page-server.const';

// Серверная половина страничного канала на настоящем `UiServer`: соединение
// по токену, `hello` с контекстом рендера из места личности, `call`/`watch`/
// `unwatch`, мусор — `refused` без броска, доставка уведомлений без `trace`
// и `recipient`. Клиент — тест: строки JSON в `link.receive`, строки сервера —
// в `push`.

const A = testUuid(1);
const B = testUuid(2);
const LIST = { screen: 'exampleUi/todo/taskList', params: { page: 0 } };
const ASSIGNED = { screen: 'exampleUi/todo/assignedTasks', params: {} };
const TOKENS = new Map([
  ['tA', A],
  ['tB', B],
]);
/** Место личностей: у A и B — разное, чтобы видеть, чьё место в `hello`. */
const PLACES = new Map<string, Place>([
  [A, { locale: 'kk-KZ', timeZone: 'Asia/Almaty' }],
  [B, { locale: 'ru-RU', timeZone: 'Asia/Oral' }],
]);
const tmp = useTempDir('dmg-ui-page-host-');

type WorldSpec = {
  readonly callers?: RecipientCallers<ExampleUser>;
  readonly tokens?: (token: string) => Promise<string | undefined>;
  readonly places?: PersonPlaces;
};

/** Порт места по `PLACES` с журналом запросов `(uuid, trace)`. */
class JournalPlaces implements PersonPlaces {
  readonly asked: { readonly uuid: string; readonly trace: Trace }[] = [];

  async place(uuid: string, trace: Trace): Promise<Place> {
    this.asked.push({ uuid, trace });
    const place = PLACES.get(uuid);
    if (place === undefined) throw new Error(`места для ${uuid} нет`);
    return place;
  }
}

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
  const places = new JournalPlaces();
  const host = new PageHost({
    app: ExamplePagesUiAppDef,
    server,
    tokens: spec.tokens ?? (async (token) => TOKENS.get(token)),
    callers: spec.callers ?? example.callers,
    places: spec.places ?? places,
    logger,
  });
  return { bus, logger, host, places };
};

type World = ReturnType<typeof world>;

/** Строки сервера одного соединения по порядку — разобранными. */
class Pushed {
  readonly messages: ServerMsg[] = [];

  readonly push = (text: string): void => {
    this.messages.push(JSON.parse(text));
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

  test('известный токен — hello первым и один раз; место — из PersonPlaces по uuid токена, без заместителя', async () => {
    const w = world();

    const { pushed } = await open(w, 'tA');

    expect(pushed.messages).toStrictEqual([
      {
        kind: 'hello',
        context: {
          locale: 'kk-KZ',
          timeZone: 'Asia/Almaty',
          delegate: false,
          readOnly: false,
        },
      },
    ]);
    expect(w.places.asked.map((a) => a.uuid)).toEqual([A]);
    expect(w.places.asked[0]?.trace.channel).toStrictEqual({
      name: PAGE_CHANNEL,
    });
  });

  test('у B — своё место', async () => {
    const w = world();

    const { pushed } = await open(w, 'tB');

    expect(pushed.messages[0]).toMatchObject({
      kind: 'hello',
      context: { locale: 'ru-RU', timeZone: 'Asia/Oral' },
    });
    expect(w.places.asked.map((a) => a.uuid)).toEqual([B]);
  });

  test('заместитель — место того, кто работает (uuid токена), а не замещаемого', async () => {
    const w = world({
      callers: {
        resolve: async () =>
          ok(new DelegateCaller(exampleUser(B), exampleUser(A), 'd-1')),
      },
    });

    const { pushed } = await open(w, 'tA');

    expect(pushed.messages[0]).toMatchObject({
      kind: 'hello',
      context: { locale: 'kk-KZ', timeZone: 'Asia/Almaty', delegate: true },
    });
    expect(w.places.asked.map((a) => a.uuid)).toEqual([A]);
  });

  test.each([
    [
      'places бросил',
      {
        places: {
          place: async () => {
            throw new Error('страж-броска-порта');
          },
        },
      },
    ],
    [
      'tokens бросил',
      {
        tokens: async () => {
          throw new Error('страж-броска-порта');
        },
      },
    ],
  ] satisfies [string, WorldSpec][])(
    '%s — refused, error фиксированным текстом, соединения нет',
    async (_name, spec) => {
      const w = world(spec);
      const pushed = new Pushed();

      const res = await w.host.connect('tA', pushed.push);

      expect(res).toEqual({ ok: false, error: 'refused' });
      expect(pushed.messages).toEqual([]);
      expect(w.host.delivery.connections(A)).toBe(0);
      expect(w.logger.records.filter((r) => r.level === 'error')).toMatchObject(
        [{ source: PAGE_CHANNEL }],
      );
      expect(JSON.stringify(w.logger.records)).not.toContain('страж');
    },
  );

  test('callers.resolve бросил — refused, один error текстом сбоя порта, соединения нет', async () => {
    const w = world({
      callers: {
        resolve: async () => {
          throw new Error('страж-броска-вызывающего');
        },
      },
    });
    const pushed = new Pushed();

    const res = await w.host.connect('tA', pushed.push);

    expect(res).toEqual({ ok: false, error: 'refused' });
    expect(pushed.messages).toEqual([]);
    expect(w.host.delivery.connections(A)).toBe(0);
    expect(w.logger.records.filter((r) => r.level === 'error')).toMatchObject([
      { source: PAGE_CHANNEL, message: HOST_LOGS.context },
    ]);
    expect(JSON.stringify(w.logger.records)).not.toContain('страж');
  });

  test('заместитель только на чтение — признаки в hello, а команда всё равно отказана сервером', async () => {
    const w = world({
      callers: {
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
  const garbage: { name: string; raw: string; id?: string }[] = [
    { name: 'не JSON', raw: '{не json' },
    { name: 'число', raw: '42' },
    { name: 'null', raw: 'null' },
    { name: 'массив', raw: '[]' },
    { name: 'неизвестный kind', raw: JSON.stringify({ kind: 'ping' }) },
    {
      name: 'лишнее поле сообщения',
      raw: JSON.stringify({ ...valid, uuid: B }),
      id: 'c1',
    },
    {
      name: 'след внутри вызова',
      raw: JSON.stringify({ ...valid, call: { ...valid.call, trace: {} } }),
      id: 'c1',
    },
    {
      name: 'вызывающий внутри вызова',
      raw: JSON.stringify({ ...valid, call: { ...valid.call, caller: B } }),
      id: 'c1',
    },
    {
      name: 'id длиннее 256 символов',
      raw: JSON.stringify({ ...valid, id: 'x'.repeat(257) }),
    },
  ];

  test.each(garbage)(
    '$name — один refused (с id, если конверт call разобрался), без броска, UC не вызван',
    async ({ raw, id }) => {
      const w = world();
      const { pushed, link } = await open(w, 'tA');

      await link.receive(raw);

      expect(pushed.messages.slice(1)).toStrictEqual([
        {
          kind: 'refused',
          reason: 'malformed',
          ...(id === undefined ? {} : { id }),
        },
      ]);
      expect(records('listTasks')).toEqual([]);
    },
  );

  test('мусор подряд — refused на каждый, warn один раз на соединение', async () => {
    const w = world();
    const { pushed, link } = await open(w, 'tA');

    for (const raw of ['{не json', '42', 'null']) await link.receive(raw);

    expect(pushed.of('refused')).toHaveLength(3);
    expect(w.logger.records.filter((r) => r.level === 'warn')).toHaveLength(1);
  });

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

describe('PageConnection — пределы соединения', () => {
  const valid = callOf('c1', 'listTasks', {}, 'r-1');

  test('строка длиннее предела — refused too-large до разбора, UC не вызван', async () => {
    const w = world();
    const { pushed, link } = await open(w, 'tA');

    await link.receive(JSON.stringify(valid).padEnd(MAX_CLIENT_TEXT + 1, ' '));

    expect(pushed.messages.slice(1)).toStrictEqual([
      { kind: 'refused', reason: 'too-large' },
    ]);
    expect(records('listTasks')).toEqual([]);
  });

  test('строка ровно на пределе — разбирается и исполняется', async () => {
    const w = world();
    const { pushed, link } = await open(w, 'tA');

    await link.receive(JSON.stringify(valid).padEnd(MAX_CLIENT_TEXT, ' '));

    expect(pushed.of('result')).toMatchObject([
      { id: 'c1', result: { ok: true } },
    ]);
  });

  test(`одновременных call — ${CALL_LIMIT}: следующий — result с SERVER_INTERNAL и один warn, остальные исполнены`, async () => {
    const w = world();
    const { pushed, link } = await open(w, 'tA');
    const ids = Array.from({ length: CALL_LIMIT + 2 }, (_, n) => `c${n + 1}`);

    await Promise.all(
      ids.map((id) => send(link, callOf(id, 'listTasks', {}, `r-${id}`))),
    );

    const results = pushed.of('result');
    const refused = results.filter((m) => m.kind === 'result' && !m.result.ok);
    expect(results).toHaveLength(CALL_LIMIT + 2);
    expect(refused).toMatchObject([
      {
        id: `c${CALL_LIMIT + 1}`,
        result: { error: { code: 'SERVER_INTERNAL' } },
      },
      {
        id: `c${CALL_LIMIT + 2}`,
        result: { error: { code: 'SERVER_INTERNAL' } },
      },
    ]);
    expect(records('listTasks')).toHaveLength(CALL_LIMIT);
    expect(w.logger.records.filter((r) => r.level === 'warn')).toHaveLength(1);
  });

  test('завершённые call освобождают место под новые', async () => {
    const w = world();
    const { pushed, link } = await open(w, 'tA');
    const ids = Array.from({ length: CALL_LIMIT }, (_, n) => `c${n + 1}`);
    await Promise.all(
      ids.map((id) => send(link, callOf(id, 'listTasks', {}, `r-${id}`))),
    );

    await send(link, callOf('after', 'listTasks', {}, 'r-after'));

    expect(pushed.of('result')).toContainEqual({
      kind: 'result',
      id: 'after',
      result: { ok: true, value: [] },
    });
  });

  test(`соединений одной личности — ${CONNECTION_LIMIT}: следующее refused, другой личности — можно; close освобождает место`, async () => {
    const w = world();
    const links = [];
    for (let n = 0; n < CONNECTION_LIMIT; n += 1) {
      links.push((await open(w, 'tA')).link);
    }
    const extra = new Pushed();

    const refused = await w.host.connect('tA', extra.push);
    const other = await w.host.connect('tB', new Pushed().push);
    links[0]?.close();
    const again = await w.host.connect('tA', new Pushed().push);

    expect(refused).toEqual({ ok: false, error: 'refused' });
    expect(extra.messages).toEqual([]);
    expect(other.ok).toBe(true);
    expect(again.ok).toBe(true);
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

  test('N повторов id подписки — watch-refused на каждый, один warn; другой вид отказа — свой warn', async () => {
    const w = world();
    const { pushed, link } = await open(w, 'tA');
    for (let n = 1; n <= WATCH_LIMIT; n += 1) {
      await send(link, { kind: 'watch', watch: `w${n}`, address: LIST });
    }

    for (let n = 0; n < 5; n += 1) {
      await send(link, { kind: 'watch', watch: 'w1', address: LIST });
    }
    const repeatWarns = w.logger.records.filter((r) => r.level === 'warn');
    await send(link, { kind: 'watch', watch: 'сверх-1', address: LIST });
    await send(link, { kind: 'watch', watch: 'сверх-2', address: LIST });

    expect(pushed.of('watch-refused')).toHaveLength(7);
    expect(repeatWarns).toHaveLength(1);
    expect(w.logger.records.filter((r) => r.level === 'warn')).toHaveLength(2);
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

  test('уведомление длиннее MAX_SERVER_TEXT — соединение его не получило, warn есть', async () => {
    const w = world();
    const b = await open(w, 'tB');

    await w.host.delivery.deliver({
      ...assignedFor(B, 'e-1'),
      data: { title: 'x'.repeat(MAX_SERVER_TEXT) },
    });

    expect(b.pushed.of('notification')).toEqual([]);
    expect(w.logger.records.filter((r) => r.level === 'warn')).toHaveLength(1);
  });

  test('закрытое соединение уведомлений не получает', async () => {
    const w = world();
    const b = await open(w, 'tB');

    b.link.close();
    await w.host.delivery.deliver(assignedFor(B, 'e-1'));

    expect(b.pushed.of('notification')).toEqual([]);
  });
});

describe('PageHost — лог без пропуска и данных клиента', () => {
  test('неизвестный токен-страж и вызов со стражем во входе — стражей в логе нет', async () => {
    const w = world();
    const guardToken = 'страж-пропуска-неизвестный';
    const guardInput = 'страж-входа-вызова';

    await w.host.connect(guardToken, new Pushed().push);
    const { link } = await open(w, 'tA');
    await send(link, callOf('c1', 'createTask', { title: guardInput }, 'r-1'));
    await send(
      link,
      callOf('c2', 'getTaskAssignee', { taskId: guardInput }, 'r-2'),
    );
    await link.receive(`{не json ${guardInput}`);

    expect(w.logger.records.filter((r) => r.level === 'warn')).not.toEqual([]);
    const text = JSON.stringify(w.logger.records);
    expect(text).not.toContain(guardToken);
    expect(text).not.toContain(guardInput);
  });
});
