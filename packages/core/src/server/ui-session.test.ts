import { describe, expect, test } from 'bun:test';
import { CoreErrors, Trace } from 'dmg-core';
import { ModuleApi } from 'dmg-core/app';
import { AwaitingBus, MemoryLogger, testUuid } from 'dmg-core/testing';
import {
  CreateTaskUcDef,
  TaskEvents,
  TodoModuleDef,
} from 'dmg-core/testing/example';
import {
  CARD_ID,
  ExampleUiSetDef,
  LIST_START,
  OWNER,
  TASK_A,
  TASK_B,
} from 'dmg-ui/example';
import { requestTrace } from '../../testing/ui-runtime.fixture';
import {
  envelopeOf,
  StubCallerSource,
  StubTransport,
} from '../../testing/ui-server.fixture';
import { AddressCodec, type AddressJson } from '../address/address-codec';
import type { RefreshSignal } from '../runtime/ports.types';
import { ModuleApiDispatch } from './module-api-dispatch';
import { ServerCalls } from './server-calls';
import { UcRoutes } from './uc-routes';
import { UiServer } from './ui-server';
import { UiSession } from './ui-session';

// Сессия сервера UI: вызывающий — на каждый вызов, след клиента сервер
// пересобирает сам, command по событию не исполняется, перечитывание —
// только по своему событию с обезличенным следом, узел канала слушает только
// объявленное.

const OTHER = testUuid(2);
const NODE = 'testChannel/join';
const LIST = LIST_START;

const setup = (source = new StubCallerSource(OWNER)) => {
  const bus = new AwaitingBus();
  const logger = new MemoryLogger();
  const transport = new StubTransport();
  const server = new UiServer({
    set: ExampleUiSetDef,
    dispatch: new ModuleApiDispatch([
      new ModuleApi(TodoModuleDef, transport, logger),
    ]),
    context: { bus, logger },
    nodes: [
      { id: NODE, uses: [CreateTaskUcDef], listens: [TaskEvents.created] },
    ],
  });
  return { bus, logger, transport, source, session: server.session(source) };
};

/** Сессия напрямую, с пределом памяти выданных сигналов `limit`. */
const limitedSession = (limit: number) => {
  const bus = new AwaitingBus();
  const logger = new MemoryLogger();
  const transport = new StubTransport();
  const name = 'ui:exampleUi';
  const calls = new ServerCalls({
    routes: UcRoutes.forSession(
      { set: ExampleUiSetDef, logger, source: name },
      [],
    ),
    dispatch: new ModuleApiDispatch([
      new ModuleApi(TodoModuleDef, transport, logger),
    ]),
    logger,
    source: name,
  });
  const session = new UiSession({
    calls,
    codec: new AddressCodec(ExampleUiSetDef),
    listens: new Map(),
    context: { bus, logger },
    source: new StubCallerSource(OWNER),
    name,
    issuedLimit: limit,
  });
  return { bus, transport, session };
};

/** Подписка на адрес: сигналы — в массив. */
const watched = (
  session: Pick<ReturnType<typeof setup>['session'], 'watch'>,
  address: AddressJson,
) => {
  const signals: RefreshSignal[] = [];
  const off = session.watch(address, (s) => signals.push(s));
  return { signals, off };
};

const created = (ownerId: string) =>
  envelopeOf(
    TaskEvents.created,
    { taskId: TASK_A, ownerId, title: 'Хлеб' },
    'e-1',
    'r-create',
  );

/** Вызов `listTasks` списка по причине `cause` (`requestId` или `eventId`). */
const listCall = (cause: Record<string, unknown>) => ({
  module: 'todo',
  uc: 'listTasks',
  input: {},
  ...cause,
});

describe('UiSession.call — вызывающий и след', () => {
  test('Caller разрешается на каждый вызов со следом запроса этого вызова', async () => {
    const { source, session } = setup();

    await session.call(listCall({ requestId: 'r-1' }));
    await session.call(listCall({ requestId: 'r-2' }));

    expect(source.traces.map((t) => t.toJSON())).toEqual([
      requestTrace('r-1'),
      requestTrace('r-2'),
    ]);
  });

  test('отказ резолвера — err с его кодом, UC не вызван', async () => {
    const denied = CoreErrors.DELEGATION_DENIED.make({ reason: 'expired' });
    const { transport, session } = setup(new StubCallerSource(OWNER, denied));

    const res = await session.call(listCall({ requestId: 'r-1' }));

    expect(res.ok ? undefined : res.error.code).toBe('DELEGATION_DENIED');
    expect(transport.sent).toEqual([]);
  });

  test('мусор вместо причины — INPUT_VALIDATION, а не бросок; UC не вызван', async () => {
    const { transport, session } = setup();
    const garbage = JSON.parse(
      '{"module":"todo","uc":"listTasks","input":{},"requestId":{"x":1}}',
    );

    const res = await session.call(garbage);

    expect(res.ok ? undefined : res.error.code).toBe('INPUT_VALIDATION');
    expect(transport.sent).toEqual([]);
  });

  test('command UC по невыданному eventId — SERVER_INTERNAL и warn, UC не вызван', async () => {
    const { logger, transport, session } = setup();

    const res = await session.call({
      module: 'todo',
      uc: 'completeTask',
      input: { taskId: TASK_A },
      eventId: 'e-1',
    });

    expect(res.ok ? undefined : res.error.code).toBe('SERVER_INTERNAL');
    expect(transport.sent).toEqual([]);
    expect(logger.records.map((r) => r.level)).toEqual(['warn']);
    expect(logger.records.map((r) => r.meta)).toEqual([
      { module: 'todo', uc: 'completeTask' },
    ]);
  });

  test('command UC по выданному eventId — SERVER_INTERNAL и warn, UC не вызван', async () => {
    const { bus, logger, transport, session } = setup();
    watched(session, LIST);
    bus.publish(created(OWNER));
    await bus.delivered();

    const res = await session.call({
      module: 'todo',
      uc: 'completeTask',
      input: { taskId: TASK_A },
      eventId: 'e-1',
    });

    expect(res.ok ? undefined : res.error.code).toBe('SERVER_INTERNAL');
    expect(transport.sent).toEqual([]);
    expect(logger.records.map((r) => r.level)).toEqual(['warn']);
    expect(logger.records.map((r) => r.meta)).toEqual([
      { module: 'todo', uc: 'completeTask' },
    ]);
  });

  test('command UC по requestId — исполнен', async () => {
    const { transport, session } = setup();

    const res = await session.call({
      module: 'todo',
      uc: 'completeTask',
      input: { taskId: TASK_A },
      requestId: 'r-1',
    });

    expect(res.ok).toBe(true);
    expect(transport.names()).toEqual(['completeTask']);
  });
});

describe('UiSession.watch — сигнал перечитывания', () => {
  test('своё событие — сигнал с eventId и обезличенным следом, без payload', async () => {
    const { bus, session } = setup();
    const { signals } = watched(session, LIST);

    bus.publish(created(OWNER));
    await bus.delivered();

    expect(signals).toEqual([
      {
        event: TaskEvents.created.name,
        eventId: 'e-1',
        trace: {
          cause: { kind: 'event', eventId: 'e-1' },
          correlationId: 'e-1',
        },
      },
    ]);
  });

  test('событие другого субъекта — сигнала нет', async () => {
    const { bus, session } = setup();
    const { signals } = watched(session, LIST);

    bus.publish(created(OTHER));
    await bus.delivered();

    expect(signals).toEqual([]);
  });

  test('событие с другими параметрами экземпляра — сигнала нет', async () => {
    const { bus, session } = setup();
    const { signals } = watched(session, {
      screen: CARD_ID,
      params: { taskId: TASK_A },
    });

    bus.publish(
      envelopeOf(
        TaskEvents.completed,
        { taskId: TASK_B, ownerId: OWNER },
        'e-2',
      ),
    );
    await bus.delivered();

    expect(signals).toEqual([]);
  });

  test('после отписки — сигнала нет', async () => {
    const { bus, session } = setup();
    const { signals, off } = watched(session, LIST);

    off();
    bus.publish(created(OWNER));
    await bus.delivered();

    expect(signals).toEqual([]);
  });

  test('адрес не декодируется — бросок, подписки нет', () => {
    const { session } = setup();

    expect(() =>
      watched(session, { screen: 'exampleUi/todo/missing', params: {} }),
    ).toThrow();
  });
});

describe('UiSession.on — узел канала', () => {
  test('событие, не объявленное узлом, — бросок с именем события', () => {
    const { session } = setup();

    expect(() =>
      session.on(NODE, TaskEvents.completed, async () => {}),
    ).toThrow(TaskEvents.completed.name);
  });
});

/** Источник с каналом сессии: след запроса сервер собирает с ним. */
class ChannelSource extends StubCallerSource {
  readonly channel = { name: 'testChannel' };
}

describe('UiSession.call — след запроса собирает сервер', () => {
  test('requestId — след с каналом сессии и correlationId = requestId', async () => {
    const source = new ChannelSource(OWNER);
    const { transport, session } = setup(source);

    await session.call(listCall({ requestId: 'r-1' }));

    const expected = Trace.fromRequest({
      requestId: 'r-1',
      channel: { name: 'testChannel' },
    }).toJSON();
    expect(expected).toEqual({
      cause: { kind: 'request', requestId: 'r-1' },
      correlationId: 'r-1',
      channel: { name: 'testChannel' },
    });
    expect(source.traces.map((t) => t.toJSON())).toEqual([expected]);
    expect(transport.sent.map((s) => s.trace.toJSON())).toEqual([expected]);
  });

  test('без канала у источника requestId — след без channel', async () => {
    const { source, session } = setup();

    await session.call(listCall({ requestId: 'r-1' }));

    expect(source.traces.map((t) => t.toJSON())).toEqual([
      { cause: { kind: 'request', requestId: 'r-1' }, correlationId: 'r-1' },
    ]);
  });

  test('чужие поля вызова (trace, channel, correlationId) в след не попадают', async () => {
    const source = new ChannelSource(OWNER);
    const { session } = setup(source);

    await session.call(
      listCall({
        requestId: 'r-1',
        trace: { cause: { kind: 'job', job: 'sweep', runId: 'run-1' } },
        channel: { name: 'чужой', visitorId: 'v-1' },
        correlationId: 'c-1',
      }),
    );

    expect(source.traces.map((t) => t.toJSON())).toEqual([
      {
        cause: { kind: 'request', requestId: 'r-1' },
        correlationId: 'r-1',
        channel: { name: 'testChannel' },
      },
    ]);
  });

  test('след выданного сессии сигнала — UC идёт с настоящим следом события', async () => {
    const { bus, transport, session } = setup();
    const { signals } = watched(session, LIST);
    bus.publish(created(OWNER));
    await bus.delivered();

    await session.call(listCall({ eventId: signals[0]?.eventId }));

    expect(transport.sent.map((s) => s.trace.toJSON())).toEqual([
      { cause: { kind: 'event', eventId: 'e-1' }, correlationId: 'r-create' },
    ]);
  });

  test('eventId, которого сессия не выдавала, — вызов исполнен со следом запроса сервера (generated), без лога', async () => {
    const { logger, transport, session } = setup();

    const res = await session.call(listCall({ eventId: 'e-1' }));

    expect(res.ok).toBe(true);
    expect(transport.sent.map((s) => s.trace.cause)).toEqual([
      { kind: 'request', requestId: expect.any(String), generated: true },
    ]);
    expect(logger.records).toEqual([]);
  });

  test('после close() выданные сигналы забыты — след запроса, а не события', async () => {
    const { bus, transport, session } = setup();
    const { signals } = watched(session, LIST);
    bus.publish(created(OWNER));
    await bus.delivered();

    session.close();
    await session.call(listCall({ eventId: signals[0]?.eventId }));

    expect(transport.sent.map((s) => s.trace.cause.kind)).toEqual(['request']);
  });

  test('вытесненный из памяти сигнал — след запроса, свежий — след события', async () => {
    const { bus, transport, session } = limitedSession(1);
    const { signals } = watched(session, LIST);
    bus.publish(created(OWNER));
    bus.publish(
      envelopeOf(TaskEvents.created, { taskId: TASK_B, ownerId: OWNER }, 'e-2'),
    );
    await bus.delivered();

    await session.call(listCall({ eventId: signals[0]?.eventId }));
    await session.call(listCall({ eventId: signals[1]?.eventId }));

    expect(transport.sent.map((s) => s.trace.cause.kind)).toEqual([
      'request',
      'event',
    ]);
  });
});

describe('UiSession.call — недоверенный вызов', () => {
  test('вызов не по схеме — INPUT_VALIDATION, UC не вызван', async () => {
    const { transport, session } = setup();
    const broken = JSON.parse(
      '{"module":5,"uc":"listTasks","requestId":"r-1"}',
    );

    const res = await session.call(broken);

    expect(res.ok ? undefined : res.error.code).toBe('INPUT_VALIDATION');
    expect(transport.sent).toEqual([]);
  });

  test('ни requestId, ни eventId — INPUT_VALIDATION, UC не вызван', async () => {
    const { transport, session } = setup();

    const res = await session.call(listCall({}));

    expect(res.ok ? undefined : res.error.code).toBe('INPUT_VALIDATION');
    expect(transport.sent).toEqual([]);
  });

  test('и requestId, и eventId — INPUT_VALIDATION, UC не вызван', async () => {
    const { transport, session } = setup();

    const res = await session.call(
      listCall({ requestId: 'r-1', eventId: 'e-1' }),
    );

    expect(res.ok ? undefined : res.error.code).toBe('INPUT_VALIDATION');
    expect(transport.sent).toEqual([]);
  });

  const LONG = 'x'.repeat(300);
  for (const [field, call] of [
    ['module', { ...listCall({ requestId: 'r-1' }), module: LONG }],
    ['uc', { ...listCall({ requestId: 'r-1' }), uc: LONG }],
    ['requestId', listCall({ requestId: LONG })],
    ['eventId', listCall({ eventId: LONG })],
  ] as const) {
    test(`слишком длинный ${field} — INPUT_VALIDATION, UC не вызван`, async () => {
      const { transport, session } = setup();

      const res = await session.call(call);

      expect(res.ok ? undefined : res.error.code).toBe('INPUT_VALIDATION');
      expect(transport.sent).toEqual([]);
    });
  }

  test('бросок резолвера — SERVER_INTERNAL и error', async () => {
    class Throwing extends StubCallerSource {
      override async resolve(): Promise<never> {
        throw new Error('сбой хранилища');
      }
    }
    const { logger, session } = setup(new Throwing(OWNER));

    const res = await session.call(listCall({ requestId: 'r-1' }));

    expect(res.ok ? undefined : res.error.code).toBe('SERVER_INTERNAL');
    expect(logger.records.map((r) => r.level)).toEqual(['error']);
    expect(logger.records.map((r) => r.meta)).toEqual([
      {
        module: 'todo',
        uc: 'listTasks',
        correlationId: 'r-1',
        error: 'вызов UC: бросок Error',
      },
    ]);
  });

  test('бросок бэкенда вызова — SERVER_INTERNAL и error', async () => {
    const { logger, transport, session } = setup();
    transport.send = async () => {
      throw new Error('сеть');
    };

    const res = await session.call(listCall({ requestId: 'r-1' }));

    expect(res.ok ? undefined : res.error.code).toBe('SERVER_INTERNAL');
    expect(logger.records.map((r) => r.level)).toEqual(['error']);
    expect(logger.records.map((r) => r.meta)).toEqual([
      {
        module: 'todo',
        uc: 'listTasks',
        correlationId: 'r-1',
        error: 'вызов UC: бросок Error',
      },
    ]);
  });
});

describe('UiSession.watch — после close()', () => {
  test('закрытая сессия не подписывает: сигнала нет', async () => {
    const { bus, session } = setup();

    session.close();
    const { signals } = watched(session, LIST);
    bus.publish(created(OWNER));
    await bus.delivered();

    expect(signals).toEqual([]);
  });
});

describe('UiSession.on — неизвестный узел', () => {
  test('узел, которого нет у сервера, — бросок с id узла', () => {
    const { session } = setup();

    expect(() =>
      session.on('testChannel/missing', TaskEvents.created, async () => {}),
    ).toThrow('testChannel/missing');
  });
});
