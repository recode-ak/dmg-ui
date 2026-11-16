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
  ExampleUiSetDef,
  OWNER,
  TASK_A,
  TASK_B,
} from '../../testing/ui-fixture';
import {
  CARD_ID,
  LIST_ID,
  requestTrace,
} from '../../testing/ui-runtime-fixture';
import {
  envelopeOf,
  StubCallerSource,
  StubTransport,
} from '../../testing/ui-server-fixture';
import type { AddressJson } from '../address/address-codec';
import type { RefreshSignal } from '../runtime/ports.types';
import { ModuleApiDispatch } from './module-api-dispatch';
import { UiServer } from './ui-server';

// Сессия сервера UI: вызывающий — на каждый вызов, след клиента сервер
// пересобирает сам, command по событию не исполняется, перечитывание —
// только по своему событию с обезличенным следом, узел канала слушает только
// объявленное.

const OTHER = testUuid(2);
const N_ID = 'exampleUi/todo/taskAssigned';
const NODE = 'testChannel/join';
const LIST = { screen: LIST_ID, params: { index: 0 } };

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

/** Подписка на адрес: сигналы — в массив. */
const watched = (
  session: ReturnType<typeof setup>['session'],
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

describe('UiSession.call — вызывающий и след', () => {
  test('Caller разрешается на каждый вызов со следом этого вызова', async () => {
    const { source, session } = setup();
    const first = requestTrace('r-1');
    const second = requestTrace('r-2');

    await session.call({
      node: LIST_ID,
      uc: 'listTasks',
      input: {},
      trace: first,
    });
    await session.call({
      node: LIST_ID,
      uc: 'listTasks',
      input: {},
      trace: second,
    });

    expect(source.traces.map((t) => t.toJSON())).toEqual([first, second]);
  });

  test('отказ резолвера — err с его кодом, UC не вызван', async () => {
    const denied = CoreErrors.DELEGATION_DENIED.make({ reason: 'expired' });
    const { transport, session } = setup(new StubCallerSource(OWNER, denied));

    const res = await session.call({
      node: LIST_ID,
      uc: 'listTasks',
      input: {},
      trace: requestTrace('r-1'),
    });

    expect(res.ok ? undefined : res.error.code).toBe('DELEGATION_DENIED');
    expect(transport.sent).toEqual([]);
  });

  test('мусор вместо следа — отказ, а не бросок; UC не вызван', async () => {
    const { transport, session } = setup();
    const garbage = JSON.parse('{"cause":"мусор"}');

    const res = await session.call({
      node: LIST_ID,
      uc: 'listTasks',
      input: {},
      trace: garbage,
    });

    expect(res.ok).toBe(false);
    expect(transport.sent).toEqual([]);
  });

  test('command UC со следом события — SERVER_INTERNAL и error, UC не вызван', async () => {
    const { logger, transport, session } = setup();
    const trace = Trace.fromEvent({
      eventId: 'e-1',
      correlationId: 'r-1',
    }).toJSON();

    const res = await session.call({
      node: CARD_ID,
      uc: 'completeTask',
      input: { taskId: TASK_A },
      trace,
    });

    expect(res.ok ? undefined : res.error.code).toBe('SERVER_INTERNAL');
    expect(transport.sent).toEqual([]);
    expect(logger.records.map((r) => r.level)).toContain('error');
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

/** Вызов `listTasks` списка со следом `trace`. */
const listCall = (trace: unknown) => ({
  node: LIST_ID,
  uc: 'listTasks',
  input: {},
  trace: JSON.parse(JSON.stringify(trace)),
});

describe('UiSession.call — след клиента пересобирает сервер', () => {
  test('причина-запрос: generated и channel клиента отброшены, channel — сессии', async () => {
    const source = new ChannelSource(OWNER);
    const { session } = setup(source);

    await session.call(
      listCall({
        cause: { kind: 'request', requestId: 'r-1', generated: true },
        correlationId: 'c-1',
        channel: { name: 'чужой', visitorId: 'v-1' },
      }),
    );

    expect(source.traces.map((t) => t.toJSON())).toEqual([
      {
        cause: { kind: 'request', requestId: 'r-1' },
        correlationId: 'c-1',
        channel: { name: 'testChannel' },
      },
    ]);
  });

  test('причина-прогон Job — отказ, UC не вызван', async () => {
    const { transport, session } = setup();

    const res = await session.call(
      listCall({
        cause: { kind: 'job', job: 'sweep', runId: 'run-1' },
        correlationId: 'run-1',
      }),
    );

    expect(res.ok).toBe(false);
    expect(transport.sent).toEqual([]);
  });

  test('след выданного сессии сигнала — UC идёт с настоящим следом события', async () => {
    const { bus, transport, session } = setup();
    const { signals } = watched(session, LIST);
    bus.publish(created(OWNER));
    await bus.delivered();

    await session.call(listCall(signals[0]?.trace));

    expect(transport.sent.map((s) => s.trace.toJSON())).toEqual([
      { cause: { kind: 'event', eventId: 'e-1' }, correlationId: 'r-create' },
    ]);
  });

  test('eventId, которого сессия не выдавала, — отказ, UC не вызван', async () => {
    const { transport, session } = setup();

    const res = await session.call(
      listCall({
        cause: { kind: 'event', eventId: 'e-1' },
        correlationId: 'e-1',
      }),
    );

    expect(res.ok).toBe(false);
    expect(transport.sent).toEqual([]);
  });

  test('после close() выданные сигналы забыты — отказ', async () => {
    const { bus, transport, session } = setup();
    const { signals } = watched(session, LIST);
    bus.publish(created(OWNER));
    await bus.delivered();

    session.close();
    const res = await session.call(listCall(signals[0]?.trace));

    expect(res.ok).toBe(false);
    expect(transport.sent).toEqual([]);
  });
});

describe('UiSession.call — недоверенный вызов', () => {
  test('узел уведомления сессии закрыт — OPERATION_NOT_FOUND', async () => {
    const { transport, session } = setup();

    const res = await session.call({
      ...listCall(requestTrace('r-1')),
      node: N_ID,
    });

    expect(res.ok ? undefined : res.error.code).toBe('OPERATION_NOT_FOUND');
    expect(transport.sent).toEqual([]);
  });

  test('вызов не по схеме — INPUT_VALIDATION, UC не вызван', async () => {
    const { transport, session } = setup();
    const broken = JSON.parse('{"node":5,"uc":"listTasks","trace":{}}');

    const res = await session.call(broken);

    expect(res.ok ? undefined : res.error.code).toBe('INPUT_VALIDATION');
    expect(transport.sent).toEqual([]);
  });

  const LONG = 'x'.repeat(300);
  for (const [field, call] of [
    ['node', { ...listCall(requestTrace('r-1')), node: LONG }],
    ['uc', { ...listCall(requestTrace('r-1')), uc: LONG }],
    ['requestId', listCall(requestTrace(LONG))],
    [
      'correlationId',
      listCall({
        cause: { kind: 'request', requestId: 'r-1' },
        correlationId: LONG,
      }),
    ],
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

    const res = await session.call(listCall(requestTrace('r-1')));

    expect(res.ok ? undefined : res.error.code).toBe('SERVER_INTERNAL');
    expect(logger.records.map((r) => r.level)).toEqual(['error']);
  });

  test('бросок бэкенда вызова — SERVER_INTERNAL и error', async () => {
    const { logger, transport, session } = setup();
    transport.send = async () => {
      throw new Error('сеть');
    };

    const res = await session.call(listCall(requestTrace('r-1')));

    expect(res.ok ? undefined : res.error.code).toBe('SERVER_INTERNAL');
    expect(logger.records.map((r) => r.level)).toEqual(['error']);
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
