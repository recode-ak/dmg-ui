import { describe, expect, test } from 'bun:test';
import {
  type AnyEventDef,
  type AnyUseCaseDef,
  CoreErrors,
  ok,
  type SerializedResult,
  Trace,
  UseCaseDef,
} from 'dmg-core';
import type { EnvelopeOf, EventEnvelope } from 'dmg-core/app';
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
  GetTaskUcDef,
  GetUserUcDef,
  ListTasksUcDef,
  RemoveUserUcDef,
  TaskEvents,
  UserErrors,
} from 'dmg-core/testing/example';
import { ExampleDialogUiAppDef } from 'dmg-ui/example';
import { ApiAppDispatch, type UcDispatch, type UcRequest } from 'dmg-ui/server';
import { oplogRecords, T0 } from 'dmg-ui/testing/fixtures';
import * as v from 'valibot';
import { MemoryMessenger } from '../../testing';
import {
  MAX_PEER_LENGTH,
  MAX_SIGNAL_ID,
} from '../conversation/conversation.const';
import type {
  CommunityPort,
  Delivery,
  MessengerCapabilities,
  MessengerPort,
} from '../messenger/messenger.types';
import { Communities } from './communities';
import { MAX_TARGETS } from './community.const';
import type {
  ChatCommunitySpec,
  ChatReactionSpec,
  ChatSignalSpec,
} from './community.types';
import { CommunityManifest } from './community-manifest';

// Исполнитель сообщества одного приложения мессенджера. Сигнал вызывает
// объявленный command UC системным вызывающим от узла сигнала: сообщество —
// ключ домена из `keys`, человек — uuid из `people`; незнакомый — по
// `strangers`, незнакомое сообщество — без вызова; отсев по id сигнала до
// исполнения. Реакция: событие → query UC → операция порта сообщества; цель —
// только выход UC, переведённый `handles`/`members`; отсев по ключу после
// успешной операции, очередь на сообщество. Сигнал операций не исполняет.
// Лог — без данных (ERR-07). Шина — `AwaitingBus`, без таймеров (TST-04).

const A = testUuid(1);
const B = testUuid(2);
/** uuid, которого нет в учебном приложении. */
const NOBODY = testUuid(5);
/** Ключ домена сообщества (из `keys`, в выходе `getTask` — поле `uuid`). */
const KEY = testUuid(9);
const TASK = testUuid(20);
/** Непрозрачный handle группы в мессенджере. */
const GROUP = 'group-handle-1';
const MEMBER_A = 'member-a';
const MEMBER_B = 'member-b';
const STRANGER = 'member-stranger';
const SIGNAL_NODE = 'exampleDialog/signal-gone';
const REACTION_NODE = 'exampleDialog/reaction-drop';
const EDITING = MemoryMessenger.editing().capabilities;
const tmp = useTempDir('dmg-ui-communities-');

/** Сигнал `left` → `removeUser`: человек и сообщество — поля входа. */
const GONE: ChatSignalSpec = {
  name: 'gone',
  label: 'Участник вышел',
  description: 'Участник вышел из группы — учётная запись удаляется.',
  signal: 'left',
  uc: RemoveUserUcDef,
  input: { userId: 'person', communityId: 'community' },
};

/** Тот же сигнал и для незнакомых (С3). */
const ANYONE: ChatSignalSpec = { ...GONE, name: 'anyone', strangers: true };

/** Бота добавили в группу: вход — только ключ сообщества, поля человека нет. */
const ADDED: ChatSignalSpec = {
  name: 'added',
  label: 'Бота добавили',
  description: 'Бота добавили в группу — сообщество отмечается.',
  signal: 'added',
  uc: RemoveUserUcDef,
  input: { communityId: 'community' },
};

/** Реакция на `todo.task.assigned`: `getTask` → исключить владельца задачи. */
const DROP: ChatReactionSpec = {
  name: 'drop',
  label: 'Исключить владельца',
  description: 'Владелец назначенной задачи исключается из группы.',
  event: TaskEvents.assigned,
  uc: GetTaskUcDef,
  input: { taskId: 'taskId' },
  operation: 'exclude',
  targets: { community: 'uuid', person: 'ownerId' },
};

/** Вторая реакция на то же событие — пригласить. */
const ASK: ChatReactionSpec = { ...DROP, name: 'ask', operation: 'invite' };

const COMMUNITY: ChatCommunitySpec = { signals: [GONE], reactions: [DROP] };

/** Выход `getTask`: задача, чей `uuid` — ключ сообщества, `ownerId` — цель. */
const TASK_ROW = {
  uuid: KEY,
  ownerId: A,
  title: 'Хлеб секретный',
  status: 'open',
};

type Spec = ConstructorParameters<typeof Communities<ExampleUser>>[0];
type Signal = Parameters<Communities<ExampleUser>['receive']>[0];

/** Бросок бэкенда или порта: имя ошибки идёт в лог, текст — нет. */
class BackendDown extends Error {
  override readonly name = 'BackendDown';
}

/** Бэкенд вызова UC: пишет запросы; отвечает заданным по имени UC или настоящему бэкенду. */
class RecordingDispatch implements UcDispatch<ExampleUser> {
  readonly requests: UcRequest<ExampleUser>[] = [];
  private readonly answers = new Map<string, SerializedResult>();
  /** Следующие вызовы бросают. */
  broken: Error | undefined;
  private gate:
    | { readonly reached: () => void; readonly open: Promise<void> }
    | undefined;

  constructor(private readonly inner?: UcDispatch<ExampleUser>) {}

  answer(uc: AnyUseCaseDef, result: SerializedResult): this {
    this.answers.set(uc.name, result);
    return this;
  }

  /** Следующий вызов ждёт `release`; `reached` — вызов дошёл до бэкенда. */
  hold() {
    const reached = Promise.withResolvers<void>();
    const open = Promise.withResolvers<void>();
    this.gate = { reached: reached.resolve, open: open.promise };
    return { reached: reached.promise, release: open.resolve };
  }

  async dispatch(request: UcRequest<ExampleUser>): Promise<SerializedResult> {
    this.requests.push(request);
    const gate = this.gate;
    if (gate !== undefined) {
      this.gate = undefined;
      gate.reached();
      await gate.open;
    }
    if (this.broken !== undefined) throw this.broken;
    if (this.inner !== undefined) return this.inner.dispatch(request);
    const answer = this.answers.get(request.uc.name);
    if (answer === undefined) {
      throw new Error(`нет ответа для ${request.uc.name}`);
    }
    return answer;
  }
}

/** Порт сообщества сцены: пишет вызовы; первый вызов можно задержать до `release`, порт можно сломать. */
class GatedCommunity implements CommunityPort {
  readonly calls: {
    readonly operation: string;
    readonly community: string;
    readonly member: string;
  }[] = [];
  broken: Error | undefined;
  private gate:
    | { readonly reached: () => void; readonly open: Promise<void> }
    | undefined;

  hold() {
    const reached = Promise.withResolvers<void>();
    const open = Promise.withResolvers<void>();
    this.gate = { reached: reached.resolve, open: open.promise };
    return { reached: reached.promise, release: open.resolve };
  }

  exclude(community: string, member: string): Promise<Delivery<void>> {
    return this.run('exclude', community, member);
  }

  invite(community: string, member: string): Promise<Delivery<void>> {
    return this.run('invite', community, member);
  }

  approve(community: string, member: string): Promise<Delivery<void>> {
    return this.run('approve', community, member);
  }

  private async run(
    operation: string,
    community: string,
    member: string,
  ): Promise<Delivery<void>> {
    this.calls.push({ operation, community, member });
    const gate = this.gate;
    if (gate !== undefined) {
      this.gate = undefined;
      gate.reached();
      await gate.open;
    }
    if (this.broken !== undefined) throw this.broken;
    return ok();
  }
}

/** Порт мессенджера с возможностями `capabilities` и портом сообщества `community` (или без него). */
const portOf = (
  capabilities: MessengerCapabilities,
  community?: CommunityPort,
): MessengerPort => {
  const base = new MemoryMessenger({ capabilities });
  return {
    capabilities,
    show: (...args) => base.show(...args),
    update: (...args) => base.update(...args),
    retire: (...args) => base.retire(...args),
    answer: (...args) => base.answer(...args),
    notify: (...args) => base.notify(...args),
    ...(community === undefined ? {} : { community }),
  };
};

/** Шина, которая считает подписки по имени события. */
class CountingBus extends AwaitingBus {
  readonly subscriptions = new Map<string, number>();

  override subscribe<D extends AnyEventDef>(
    def: D,
    handler: (envelope: EnvelopeOf<D>) => Promise<void>,
  ): () => void {
    this.subscriptions.set(
      def.name,
      (this.subscriptions.get(def.name) ?? 0) + 1,
    );
    return super.subscribe(def, handler);
  }
}

/** Конверт `todo.task.assigned`; `payload` по умолчанию — задача `TASK` владельца A. */
const assigned = (
  eventId: string,
  payload: Readonly<Record<string, unknown>> = {
    taskId: TASK,
    ownerId: A,
    assigneeId: B,
  },
): EventEnvelope => ({
  name: TaskEvents.assigned.name,
  payload,
  eventId,
  occurredAt: T0,
  aggregateId: TASK,
  cause: { kind: 'request', requestId: 'r-assign' },
  correlationId: 'r-assign',
});

type SceneOptions = {
  readonly community?: ChatCommunitySpec;
  readonly messenger?: MessengerPort;
  readonly dispatch?: RecordingDispatch;
  readonly bus?: AwaitingBus;
  readonly ports?: Partial<
    Pick<Spec, 'people' | 'members' | 'keys' | 'handles'>
  >;
  readonly limit?: { readonly signals?: number; readonly reactions?: number };
};

/**
 * Исполнитель на заглушках: участники A и B (`member-a`, `member-b`), группа
 * `GROUP` ↔ ключ `KEY`; `getTask` отвечает `TASK_ROW`, `removeUser` — `ok`.
 * Вызовы портов перевода пишутся в `calls`; `messenger` в итоге — подставной
 * editing, если сцена не задала свой порт.
 */
const sceneOf = (options: SceneOptions = {}) => {
  const bus = options.bus ?? new AwaitingBus();
  const logger = new MemoryLogger();
  const editing = MemoryMessenger.editing();
  const messenger = options.messenger ?? editing;
  const dispatch =
    options.dispatch ??
    new RecordingDispatch()
      .answer(GetTaskUcDef, ok(TASK_ROW))
      .answer(RemoveUserUcDef, ok({}));
  const calls = {
    people: [] as string[],
    members: [] as string[],
    keys: [] as string[],
    handles: [] as string[],
  };
  const people = new Map([
    [MEMBER_A, A],
    [MEMBER_B, B],
  ]);
  const members = new Map([
    [A, MEMBER_A],
    [B, MEMBER_B],
  ]);
  let requests = 0;
  const communities = new Communities<ExampleUser>({
    app: ExampleDialogUiAppDef,
    community: options.community ?? COMMUNITY,
    messenger,
    dispatch,
    context: { bus, logger },
    people: async (member: string) => {
      calls.people.push(member);
      return people.get(member);
    },
    members: async (uuid: string) => {
      calls.members.push(uuid);
      return members.get(uuid);
    },
    keys: async (handle: string) => {
      calls.keys.push(handle);
      return handle === GROUP ? KEY : undefined;
    },
    handles: async (key: string) => {
      calls.handles.push(key);
      return key === KEY ? GROUP : undefined;
    },
    requestIds: () => {
      requests += 1;
      return `q-${requests}`;
    },
    ...options.ports,
    ...(options.limit === undefined ? {} : { limit: options.limit }),
  });
  return { communities, bus, logger, messenger: editing, dispatch, calls };
};

/** Учебное приложение во временном каталоге с пользователями A и B; бэкенд — настоящий. */
const exampleWorld = () => {
  const example = new ExampleApp(
    { mode: 'test', dataDir: tmp().path, users: [A, B] },
    { bus: new AwaitingBus(), logger: new MemoryLogger(), clock: () => T0 },
  );
  return {
    example,
    dispatch: new RecordingDispatch(new ApiAppDispatch(example.api)),
  };
};

const OplogRecord = v.object({
  op: v.string(),
  caller: v.unknown(),
  input: v.unknown(),
  trace: v.unknown(),
  result: v.object({ ok: v.boolean() }),
});

const oplog = (op: string) =>
  oplogRecords(tmp().path)
    .map((record) => v.parse(OplogRecord, record))
    .filter((record) => record.op === op);

let signalIds = 0;
/** Сигнал `left` участника A в группе `GROUP`; `over` подменяет поля. */
const signal = (over: Partial<Signal> = {}): Signal => {
  signalIds += 1;
  return {
    id: `sig-${signalIds}`,
    kind: 'left',
    community: GROUP,
    member: MEMBER_A,
    ...over,
  };
};

/** Записи лога без текста сообщения: уровень, источник, meta. */
const records = (logger: MemoryLogger) =>
  logger.records.map(({ level, source, meta }) => ({ level, source, meta }));

/** Одна запись лога с этими уровнем и полями meta. */
const logged = (
  level: 'warn' | 'error',
  meta: Readonly<Record<string, unknown>>,
) => ({
  level,
  source: 'chat-ui',
  meta: expect.objectContaining({ messenger: EDITING.name, ...meta }),
});

/** Текст броска сборки; не бросило — пустая строка. */
const thrown = (build: () => unknown): string => {
  try {
    build();
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

/** Записи подписчика платформы о сбое обработчика события. */
const subscriberFailures = (logger: MemoryLogger) =>
  logger.records.filter(({ message }) =>
    message.startsWith('обработчик события'),
  );

describe('Communities — сигнал вызывает объявленный UC', () => {
  test('сигнал left известного участника — removeUser от системы от узла сигнала: userId из people, communityId из keys, след запроса канала', async () => {
    const { dispatch } = exampleWorld();
    const { communities } = sceneOf({ dispatch });

    await communities.receive(signal());

    const [record, ...rest] = oplog('removeUser');
    expect(rest).toEqual([]);
    expect(record).toEqual({
      op: 'removeUser',
      caller: {
        kind: 'system',
        from: { kind: 'app', module: 'exampleUi', name: SIGNAL_NODE },
      },
      input: { userId: A, communityId: KEY },
      trace: {
        cause: { kind: 'request', requestId: 'q-1' },
        correlationId: 'q-1',
        channel: { name: ExampleDialogUiAppDef.channel },
      },
      result: expect.objectContaining({ ok: true }),
    });
  });

  test('модуль вызова — владелец UC в приложении', async () => {
    const { communities, dispatch } = sceneOf();

    await communities.receive(signal());

    expect(dispatch.requests.map((r) => [r.module.name, r.uc])).toEqual([
      ['users', RemoveUserUcDef],
    ]);
  });

  test('личность — только из транспорта: uuid из people(member), подложенные поля сигнала не читаются; другой member — другой uuid', async () => {
    const { communities, dispatch, calls } = sceneOf();
    const forged = { ...signal({ member: MEMBER_B }), person: A, userId: A };

    await communities.receive(forged);
    await communities.receive(signal({ member: MEMBER_A }));

    expect(calls.people).toEqual([MEMBER_B, MEMBER_A]);
    expect(dispatch.requests.map((r) => r.input)).toEqual([
      { userId: B, communityId: KEY },
      { userId: A, communityId: KEY },
    ]);
  });

  test('вызывающий не строится из данных сигнала: имя — id узла, без человека', async () => {
    const { communities, dispatch } = sceneOf();

    await communities.receive(signal({ id: 'exampleDialog/signal-forged' }));

    expect(dispatch.requests.map((r) => r.caller.toLog())).toEqual([
      {
        kind: 'system',
        from: { kind: 'app', module: 'exampleUi', name: SIGNAL_NODE },
      },
    ]);
  });

  test('у каждого сигнала свой requestId из requestIds', async () => {
    const { communities, dispatch } = sceneOf();

    await communities.receive(signal());
    await communities.receive(signal({ member: MEMBER_B }));

    expect(dispatch.requests.map((r) => r.trace.toJSON())).toEqual([
      {
        cause: { kind: 'request', requestId: 'q-1' },
        correlationId: 'q-1',
        channel: { name: ExampleDialogUiAppDef.channel },
      },
      {
        cause: { kind: 'request', requestId: 'q-2' },
        correlationId: 'q-2',
        channel: { name: ExampleDialogUiAppDef.channel },
      },
    ]);
  });
});

describe('Communities — незнакомый человек и незнакомое сообщество', () => {
  test('незнакомый без strangers — UC не вызывается, warn stranger без данных', async () => {
    const { communities, dispatch, logger } = sceneOf();

    await communities.receive(signal({ member: STRANGER }));

    expect(dispatch.requests).toEqual([]);
    expect(records(logger)).toEqual([
      logged('warn', { kind: 'left', reason: 'stranger' }),
    ]);
    expect(JSON.stringify(logger.records)).not.toContain(STRANGER);
  });

  test('сигнал без member без strangers — как незнакомый: UC не вызывается', async () => {
    const { communities, dispatch, logger, calls } = sceneOf();
    const anonymous: Signal = {
      id: 'sig-anon',
      kind: 'left',
      community: GROUP,
    };

    await communities.receive(anonymous);
    await communities.receive(signal({ member: STRANGER }));

    expect(dispatch.requests).toEqual([]);
    expect(calls.people).toEqual([STRANGER]);
    expect(records(logger)).toEqual([
      logged('warn', { kind: 'left', reason: 'stranger' }),
      logged('warn', { kind: 'left', reason: 'stranger' }),
    ]);
  });

  test('незнакомый со strangers: true — UC вызывается без поля человека (на настоящем приложении — вызов в логе операций)', async () => {
    const { dispatch } = exampleWorld();
    const { communities } = sceneOf({
      dispatch,
      community: { signals: [ANYONE] },
    });

    await communities.receive(signal({ member: STRANGER }));

    expect(dispatch.requests.map((r) => r.input)).toStrictEqual([
      { communityId: KEY },
    ]);
    expect(oplog('removeUser').map((r) => [r.caller, r.input])).toEqual([
      [
        {
          kind: 'system',
          from: {
            kind: 'app',
            module: 'exampleUi',
            name: 'exampleDialog/signal-anyone',
          },
        },
        { communityId: KEY },
      ],
    ]);
  });

  test('strangers: true не мешает известному — uuid в поле человека', async () => {
    const { communities, dispatch } = sceneOf({
      community: { signals: [ANYONE] },
    });

    await communities.receive(signal());

    expect(dispatch.requests.map((r) => r.input)).toEqual([
      { userId: A, communityId: KEY },
    ]);
  });

  test('манифест без поля person от незнакомого — UC вызывается без strangers, people не спрашивается', async () => {
    const { communities, dispatch, logger, calls } = sceneOf({
      community: { signals: [ADDED] },
    });

    await communities.receive(signal({ kind: 'added', member: STRANGER }));
    await communities.receive({
      id: 'sig-bare',
      kind: 'added',
      community: GROUP,
    });

    expect(calls.people).toEqual([]);
    expect(dispatch.requests.map((r) => r.input)).toStrictEqual([
      { communityId: KEY },
      { communityId: KEY },
    ]);
    expect(logger.records).toEqual([]);
  });

  test('манифесты вида с человеком и без: незнакомому — только манифест без человека, за другой — warn stranger', async () => {
    const { communities, dispatch, logger } = sceneOf({
      community: {
        signals: [GONE, { ...ADDED, name: 'bare', signal: 'left' }],
      },
    });

    await communities.receive(signal({ member: STRANGER }));

    expect(
      dispatch.requests.map(
        (r) => (r.caller.toLog() as { from: { name: string } }).from.name,
      ),
    ).toEqual(['exampleDialog/signal-bare']);
    expect(records(logger)).toEqual([
      logged('warn', { kind: 'left', reason: 'stranger' }),
    ]);
  });

  test.each([
    ['people', { people: async () => '' }, 'stranger'],
    ['keys', { keys: async () => '' }, 'unknownCommunity'],
  ] as const)(
    'порт %s вернул пустую строку — как «не знаем»: UC не вызывается, warn %s',
    async (_, ports, reason) => {
      const { communities, dispatch, logger } = sceneOf({ ports });

      await communities.receive(signal());

      expect(dispatch.requests).toEqual([]);
      expect(records(logger)).toEqual([
        logged('warn', { kind: 'left', reason }),
      ]);
    },
  );

  test('незнакомое сообщество (keys → undefined) — UC не вызывается, people не спрашивается, warn unknownCommunity', async () => {
    const { communities, dispatch, logger, calls } = sceneOf({
      community: { signals: [ANYONE] },
    });

    await communities.receive(signal({ community: 'group-unknown' }));

    expect(calls.keys).toEqual(['group-unknown']);
    expect(calls.people).toEqual([]);
    expect(dispatch.requests).toEqual([]);
    expect(records(logger)).toEqual([
      logged('warn', { kind: 'left', reason: 'unknownCommunity' }),
    ]);
    expect(JSON.stringify(logger.records)).not.toContain('group-unknown');
  });
});

describe('Communities — отсев повтора сигнала', () => {
  test('повтор сигнала (тот же вид, сообщество, участник и id) — UC один раз', async () => {
    const { communities, dispatch } = sceneOf();
    const once = signal();

    await communities.receive(once);
    await communities.receive(once);
    await communities.receive({ ...once });

    expect(dispatch.requests).toHaveLength(1);
  });

  test('один id — разные участники, вид или сообщество (один апдейт на несколько вступивших): UC на каждый сигнал', async () => {
    const { communities, dispatch } = sceneOf({
      community: {
        signals: [GONE, { ...GONE, name: 'came', signal: 'joined' }],
      },
      ports: { keys: async () => KEY },
    });
    const id = 'update-1';

    await communities.receive(signal({ id, member: MEMBER_A }));
    await communities.receive(signal({ id, member: MEMBER_B }));
    await communities.receive(signal({ id, kind: 'joined' }));
    await communities.receive(signal({ id, community: 'group-handle-2' }));
    await communities.receive(signal({ id, member: MEMBER_B }));

    expect(dispatch.requests.map((r) => r.input)).toEqual([
      { userId: A, communityId: KEY },
      { userId: B, communityId: KEY },
      { userId: A, communityId: KEY },
      { userId: A, communityId: KEY },
    ]);
  });

  test('очередь на handle: второй сигнал того же сообщества ждёт первого, сигнал другого — нет', async () => {
    const dispatch = new RecordingDispatch().answer(RemoveUserUcDef, ok({}));
    const { reached, release } = dispatch.hold();
    const asked: string[] = [];
    const { communities } = sceneOf({
      dispatch,
      ports: {
        keys: async (handle: string) => {
          asked.push(handle);
          return KEY;
        },
      },
    });

    const first = communities.receive(signal({ member: MEMBER_A }));
    await reached;
    const second = communities.receive(signal({ member: MEMBER_B }));
    await communities.receive(signal({ community: 'group-handle-2' }));

    expect(asked).toEqual([GROUP, 'group-handle-2']);
    expect(dispatch.requests).toHaveLength(2);

    release();
    await Promise.all([first, second]);

    expect(asked).toEqual([GROUP, 'group-handle-2', GROUP]);
    expect(dispatch.requests.map((r) => r.input)).toEqual([
      { userId: A, communityId: KEY },
      { userId: A, communityId: KEY },
      { userId: B, communityId: KEY },
    ]);
  });

  test('id принимается до исполнения: после броска бэкенда повтор того же id не вызывает UC', async () => {
    const dispatch = new RecordingDispatch().answer(RemoveUserUcDef, ok({}));
    dispatch.broken = new BackendDown('секрет бэкенда');
    const { communities } = sceneOf({ dispatch });
    const once = signal();

    await communities.receive(once);
    dispatch.broken = undefined;
    await communities.receive(once);

    expect(dispatch.requests).toHaveLength(1);
  });

  test('предел: после limit.signals + 1 разных id первый исполняется снова, недавний — нет', async () => {
    const { communities, dispatch } = sceneOf({ limit: { signals: 2 } });
    const [first, second, third] = [signal(), signal(), signal()];

    await communities.receive(first);
    await communities.receive(second);
    await communities.receive(third);
    await communities.receive(first);
    await communities.receive(third);

    expect(dispatch.requests).toHaveLength(4);
  });
});

describe('Communities — пределы сигнала', () => {
  test.each([
    [
      'id длиннее MAX_SIGNAL_ID',
      { id: 'i'.repeat(MAX_SIGNAL_ID + 1) },
      'signalId',
    ],
    ['пустой community', { community: '' }, 'community'],
    [
      'community длиннее MAX_PEER_LENGTH',
      { community: 'g'.repeat(MAX_PEER_LENGTH + 1) },
      'community',
    ],
    [
      'member длиннее MAX_PEER_LENGTH',
      { member: 'm'.repeat(MAX_PEER_LENGTH + 1) },
      'member',
    ],
    // Транспорт отдаёт id числами: не строка — отказ той же причиной.
    ['id не строка', { id: 7 } as unknown as Partial<Signal>, 'signalId'],
    [
      'community не строка',
      { community: 42 } as unknown as Partial<Signal>,
      'community',
    ],
    ['member не строка', { member: 5 } as unknown as Partial<Signal>, 'member'],
  ] as const)(
    '%s — UC не вызывается, порты и мессенджер не тронуты, warn с причиной',
    async (_, over, reason) => {
      const { communities, dispatch, logger, calls, messenger } = sceneOf();

      await communities.receive(signal(over));

      expect(dispatch.requests).toEqual([]);
      expect(calls).toEqual({ people: [], members: [], keys: [], handles: [] });
      expect(messenger.journal).toEqual([]);
      expect(records(logger)).toEqual([
        logged('warn', { kind: 'left', reason }),
      ]);
    },
  );

  test('вид вне COMMUNITY_SIGNALS — в записи предела поля kind нет', async () => {
    const { communities, dispatch, logger } = sceneOf();
    const forged = {
      ...signal({ id: 'i'.repeat(MAX_SIGNAL_ID + 1) }),
      kind: 'kind-forged',
    } as unknown as Signal;

    await communities.receive(forged);

    expect(dispatch.requests).toEqual([]);
    expect(logger.records.map(({ meta }) => meta)).toEqual([
      { messenger: EDITING.name, reason: 'signalId' },
    ]);
  });

  test('ровно на пределах — UC вызывается', async () => {
    const community = 'g'.repeat(MAX_PEER_LENGTH);
    const member = 'm'.repeat(MAX_PEER_LENGTH);
    const { communities, dispatch } = sceneOf({
      ports: {
        keys: async () => KEY,
        people: async () => A,
      },
    });

    await communities.receive(
      signal({ id: 'i'.repeat(MAX_SIGNAL_ID), community, member }),
    );

    expect(dispatch.requests).toHaveLength(1);
  });
});

describe('Communities — сигнал не исполняет операцию и вид без манифеста', () => {
  test('сигнал не исполняет операцию сообщества: журнал порта пуст при любом сигнале', async () => {
    const kinds = ['joined', 'left', 'added', 'removed', 'requested'] as const;
    const { communities, messenger, dispatch } = sceneOf({
      community: {
        signals: kinds.map((kind) => ({ ...ANYONE, name: kind, signal: kind })),
        reactions: [DROP],
      },
    });

    for (const kind of kinds) {
      await communities.receive(signal({ kind }));
      await communities.receive(signal({ kind, member: STRANGER }));
      await communities.receive(signal({ kind, community: 'group-unknown' }));
    }

    expect(dispatch.requests).toHaveLength(kinds.length * 2);
    expect(messenger.journal).toEqual([]);
  });

  test('вид сигнала без манифеста — ничего: ни UC, ни портов, ни лога', async () => {
    const { communities, dispatch, logger, calls } = sceneOf();

    await communities.receive(signal({ kind: 'joined' }));
    await communities.receive(signal({ kind: 'requested' }));

    expect(dispatch.requests).toEqual([]);
    expect(calls).toEqual({ people: [], members: [], keys: [], handles: [] });
    expect(logger.records).toEqual([]);
  });

  test('два манифеста одного вида — по вызову на каждый', async () => {
    const { communities, dispatch } = sceneOf({
      community: { signals: [GONE, ANYONE] },
    });

    await communities.receive(signal());

    expect(
      dispatch.requests.map(
        (r) => (r.caller.toLog() as { from: { name: string } }).from.name,
      ),
    ).toEqual([SIGNAL_NODE, 'exampleDialog/signal-anyone']);
  });
});

describe('Communities — отказ и сбой UC сигнала', () => {
  test('отказ UC (нет пользователя в приложении) — warn с кодом', async () => {
    const { dispatch } = exampleWorld();
    const { communities, logger } = sceneOf({
      dispatch,
      ports: { people: async () => NOBODY },
    });

    await communities.receive(signal());

    expect(records(logger)).toEqual([
      logged('warn', { kind: 'left', code: UserErrors.NOT_FOUND.code }),
    ]);
  });

  test('бросок бэкенда — receive не бросает, error с именем ошибки без её текста', async () => {
    const dispatch = new RecordingDispatch();
    dispatch.broken = new BackendDown('секрет бэкенда');
    const { communities, logger } = sceneOf({ dispatch });

    await expect(communities.receive(signal())).resolves.toBeUndefined();

    expect(records(logger)).toEqual([
      logged('error', { kind: 'left', name: 'BackendDown' }),
    ]);
    expect(JSON.stringify(logger.records)).not.toContain('секрет');
  });

  test.each(['keys', 'people'] as const)(
    'бросок порта %s — receive не бросает, UC не вызывается, error с именем ошибки',
    async (port) => {
      const failing = async (): Promise<never> => {
        throw new BackendDown('секрет порта');
      };
      const { communities, dispatch, logger } = sceneOf({
        ports: port === 'keys' ? { keys: failing } : { people: failing },
      });

      await expect(communities.receive(signal())).resolves.toBeUndefined();

      expect(dispatch.requests).toEqual([]);
      expect(records(logger)).toEqual([
        logged('error', { kind: 'left', name: 'BackendDown' }),
      ]);
      expect(JSON.stringify(logger.records)).not.toContain('секрет');
    },
  );
});

describe('Communities — реакция: событие → query UC → операция порта', () => {
  test('событие → getTask от системы от узла реакции со следом события → exclude с handles(key) и members(uuid)', async () => {
    const { communities, bus, dispatch, messenger, calls } = sceneOf();
    communities.start();

    bus.publish(assigned('e-1'));
    await bus.delivered();

    expect(
      dispatch.requests.map((r) => ({
        module: r.module.name,
        uc: r.uc,
        input: r.input,
        caller: r.caller.toLog(),
        trace: r.trace.toJSON(),
      })),
    ).toEqual([
      {
        module: 'todo',
        uc: GetTaskUcDef,
        input: { taskId: TASK },
        caller: {
          kind: 'system',
          from: { kind: 'app', module: 'exampleUi', name: REACTION_NODE },
        },
        trace: {
          cause: { kind: 'event', eventId: 'e-1' },
          correlationId: 'r-assign',
        },
      },
    ]);
    expect(calls.handles).toEqual([KEY]);
    expect(calls.members).toEqual([A]);
    expect(messenger.journal).toEqual([
      {
        op: 'community',
        operation: 'exclude',
        community: GROUP,
        member: MEMBER_A,
      },
    ]);
  });

  test.each(['exclude', 'invite', 'approve'] as const)(
    'операция %s манифеста — тот же метод порта',
    async (operation) => {
      const { communities, bus, messenger } = sceneOf({
        community: { reactions: [{ ...DROP, operation }] },
      });
      communities.start();

      bus.publish(assigned('e-1'));
      await bus.delivered();

      expect(messenger.journal).toEqual([
        { op: 'community', operation, community: GROUP, member: MEMBER_A },
      ]);
    },
  );

  test('цели — только из выхода UC: другой uuid и ключ в payload в цель не идут', async () => {
    const { communities, bus, messenger, calls } = sceneOf();
    communities.start();

    bus.publish(
      assigned('e-1', {
        taskId: TASK,
        ownerId: B,
        assigneeId: B,
        uuid: testUuid(10),
      }),
    );
    await bus.delivered();

    expect(calls.members).toEqual([A]);
    expect(calls.handles).toEqual([KEY]);
    expect(messenger.journal).toEqual([
      {
        op: 'community',
        operation: 'exclude',
        community: GROUP,
        member: MEMBER_A,
      },
    ]);
  });

  test('выход — массив: операция на каждую строку; строка не по форме пропущена с warn target', async () => {
    const dispatch = new RecordingDispatch().answer(
      GetTaskUcDef,
      ok([
        { uuid: KEY, ownerId: A },
        { uuid: KEY, ownerId: 5 },
        { ownerId: B },
        null,
        'строка',
        { uuid: KEY, ownerId: B },
      ]),
    );
    const { communities, bus, messenger, logger } = sceneOf({ dispatch });
    communities.start();

    bus.publish(assigned('e-1'));
    await bus.delivered();

    expect(messenger.journal).toEqual([
      {
        op: 'community',
        operation: 'exclude',
        community: GROUP,
        member: MEMBER_A,
      },
      {
        op: 'community',
        operation: 'exclude',
        community: GROUP,
        member: MEMBER_B,
      },
    ]);
    expect(records(logger)).toEqual(
      Array.from({ length: 4 }, () =>
        logged('warn', { reaction: REACTION_NODE, reason: 'target' }),
      ),
    );
  });

  test('строк больше MAX_TARGETS — исполнены первые MAX_TARGETS, лишние отброшены с одним warn targets', async () => {
    const rows = Array.from({ length: MAX_TARGETS + 1 }, (_, i) => ({
      uuid: KEY,
      ownerId: testUuid(100 + i),
    }));
    const dispatch = new RecordingDispatch().answer(GetTaskUcDef, ok(rows));
    const { communities, bus, messenger, logger } = sceneOf({
      dispatch,
      ports: { members: async (uuid: string) => `m-${uuid}` },
    });
    communities.start();

    bus.publish(assigned('e-1'));
    await bus.delivered();

    expect(messenger.journal).toHaveLength(MAX_TARGETS);
    expect(messenger.journal.at(0)).toEqual(
      expect.objectContaining({ member: `m-${testUuid(100)}` }),
    );
    expect(messenger.journal.at(-1)).toEqual(
      expect.objectContaining({
        member: `m-${testUuid(100 + MAX_TARGETS - 1)}`,
      }),
    );
    expect(records(logger)).toEqual([
      logged('warn', { reaction: REACTION_NODE, reason: 'targets' }),
    ]);
  });
});

describe('Communities — отсев повтора события и очередь сообщества', () => {
  test('повтор события (тот же eventId) — операция один раз', async () => {
    const { communities, bus, messenger } = sceneOf();
    communities.start();

    bus.publish(assigned('e-1'));
    await bus.delivered();
    bus.publish(assigned('e-1'));
    await bus.delivered();

    expect(messenger.journal).toHaveLength(1);
  });

  test('недоставка — warn с операцией и причиной; повтор того же события доходит', async () => {
    const { communities, bus, messenger, logger } = sceneOf();
    communities.start();

    messenger.failNext('unavailable');
    bus.publish(assigned('e-1'));
    await bus.delivered();
    bus.publish(assigned('e-1'));
    await bus.delivered();

    expect(
      messenger.journal.filter((entry) => entry.op === 'community'),
    ).toEqual([
      {
        op: 'community',
        operation: 'exclude',
        community: GROUP,
        member: MEMBER_A,
      },
    ]);
    expect(records(logger)).toEqual([
      logged('warn', {
        reaction: REACTION_NODE,
        operation: 'exclude',
        reason: 'unavailable',
      }),
    ]);
  });

  test('предел: после limit.reactions + 1 ключей самый давний исполняется снова, недавний — нет', async () => {
    const { communities, bus, messenger } = sceneOf({
      limit: { reactions: 2 },
    });
    communities.start();

    for (const eventId of ['e-1', 'e-2', 'e-3', 'e-1', 'e-3']) {
      bus.publish(assigned(eventId));
      await bus.delivered();
    }

    expect(messenger.journal).toHaveLength(4);
  });

  test('ключ отсева — реакция, событие и цель: другая строка выхода того же события исполняется', async () => {
    const dispatch = new RecordingDispatch().answer(
      GetTaskUcDef,
      ok([{ uuid: KEY, ownerId: A }]),
    );
    const { communities, bus, messenger } = sceneOf({ dispatch });
    communities.start();

    bus.publish(assigned('e-1'));
    await bus.delivered();
    dispatch.answer(
      GetTaskUcDef,
      ok([
        { uuid: KEY, ownerId: A },
        { uuid: KEY, ownerId: B },
      ]),
    );
    bus.publish(assigned('e-1'));
    await bus.delivered();

    expect(messenger.journal).toEqual([
      {
        op: 'community',
        operation: 'exclude',
        community: GROUP,
        member: MEMBER_A,
      },
      {
        op: 'community',
        operation: 'exclude',
        community: GROUP,
        member: MEMBER_B,
      },
    ]);
  });

  test('два одновременных повтора одного события — операция один раз (очередь сообщества)', async () => {
    const port = new GatedCommunity();
    const { reached, release } = port.hold();
    const { communities, bus } = sceneOf({
      messenger: portOf(EDITING, port),
    });
    communities.start();

    bus.publish(assigned('e-1'));
    bus.publish(assigned('e-1'));
    await reached;
    release();
    await bus.delivered();

    expect(port.calls).toEqual([
      { operation: 'exclude', community: GROUP, member: MEMBER_A },
    ]);
  });
});

describe('Communities — отказы и сбои реакции', () => {
  /** Порт перевода сцены, который «не знает»: `undefined` или пустая строка. */
  const unknown =
    (value: '' | undefined) => async (): Promise<string | undefined> =>
      value;

  test.each([
    ['handles → undefined', { handles: unknown(undefined) }, 'noHandle'],
    ['members → undefined', { members: unknown(undefined) }, 'noMember'],
    ['handles → пустая строка', { handles: unknown('') }, 'noHandle'],
    ['members → пустая строка', { members: unknown('') }, 'noMember'],
  ] as const)('%s — warn, операции нет', async (_, ports, reason) => {
    const { communities, bus, messenger, logger } = sceneOf({ ports });
    communities.start();

    bus.publish(assigned('e-1'));
    await bus.delivered();

    expect(messenger.journal).toEqual([]);
    expect(records(logger)).toEqual([
      logged('warn', { reaction: REACTION_NODE, reason }),
    ]);
  });

  test('отказ query UC политикой на настоящем приложении — warn с кодом, операции нет', async () => {
    const { example, dispatch } = exampleWorld();
    const trace = Trace.fromRequest({ requestId: 'r-create' });
    const owner = await example.callers.resolve(B, trace);
    if (!owner.ok) throw new Error('вызывающий не найден');
    const created = await example.api.dispatchByName(
      'todo',
      UseCaseDef.commandOf(CreateTaskUcDef, { title: 'Хлеб' }),
      owner.value,
      trace,
    );
    if (!created.ok) throw new Error('createTask не исполнен');
    const { taskId } = v.parse(v.object({ taskId: v.string() }), created.value);
    const { communities, bus, messenger, logger } = sceneOf({ dispatch });
    communities.start();

    bus.publish(assigned('e-1', { taskId, ownerId: B, assigneeId: A }));
    await bus.delivered();

    expect(dispatch.requests.map((r) => r.uc)).toEqual([GetTaskUcDef]);
    expect(messenger.journal).toEqual([]);
    expect(records(logger)).toEqual([
      logged('warn', {
        reaction: REACTION_NODE,
        event: TaskEvents.assigned.name,
        code: CoreErrors.ACCESS_DENIED.code,
      }),
    ]);
  });

  test('бросок dispatch — error с именем ошибки; записи подписчика платформы «обработчик события … упал» нет', async () => {
    const dispatch = new RecordingDispatch();
    dispatch.broken = new BackendDown('секрет бэкенда');
    const { communities, bus, messenger, logger } = sceneOf({ dispatch });
    communities.start();

    bus.publish(assigned('e-1'));
    await expect(bus.delivered()).resolves.toBeUndefined();

    expect(messenger.journal).toEqual([]);
    expect(subscriberFailures(logger)).toEqual([]);
    expect(records(logger)).toEqual([
      logged('error', { reaction: REACTION_NODE, name: 'BackendDown' }),
    ]);
    expect(JSON.stringify(logger.records)).not.toContain('секрет');
  });

  test('бросок порта сообщества — error с именем ошибки, ключ не принят: повтор исполняется снова', async () => {
    const port = new GatedCommunity();
    port.broken = new BackendDown('секрет порта');
    const { communities, bus, logger } = sceneOf({
      messenger: portOf(EDITING, port),
    });
    communities.start();

    bus.publish(assigned('e-1'));
    await expect(bus.delivered()).resolves.toBeUndefined();
    port.broken = undefined;
    bus.publish(assigned('e-1'));
    await bus.delivered();

    expect(port.calls).toHaveLength(2);
    expect(subscriberFailures(logger)).toEqual([]);
    expect(records(logger)).toEqual([
      logged('error', {
        reaction: REACTION_NODE,
        operation: 'exclude',
        name: 'BackendDown',
      }),
    ]);
    expect(JSON.stringify(logger.records)).not.toContain('секрет');
  });

  test.each(['handles', 'members'] as const)(
    'бросок порта %s — error с именем ошибки, операции нет, подписчик платформы молчит',
    async (name) => {
      const failing = async (): Promise<never> => {
        throw new BackendDown('секрет порта');
      };
      const { communities, bus, messenger, logger } = sceneOf({
        ports: name === 'handles' ? { handles: failing } : { members: failing },
      });
      communities.start();

      bus.publish(assigned('e-1'));
      await expect(bus.delivered()).resolves.toBeUndefined();

      expect(messenger.journal).toEqual([]);
      expect(subscriberFailures(logger)).toEqual([]);
      expect(records(logger)).toEqual([
        logged('error', { reaction: REACTION_NODE, name: 'BackendDown' }),
      ]);
    },
  );
});

describe('Communities — лог без данных (ERR-07)', () => {
  test('ни одна запись не содержит handle, member, uuid, ключ сообщества, id сигнала, payload и текст броска', async () => {
    const dispatch = new RecordingDispatch()
      .answer(
        GetTaskUcDef,
        ok([TASK_ROW, { uuid: KEY, ownerId: 5 }, { uuid: KEY, ownerId: B }]),
      )
      .answer(RemoveUserUcDef, ok({}));
    const { communities, bus, messenger, logger } = sceneOf({
      dispatch,
      ports: {
        members: async (uuid: string) => (uuid === A ? MEMBER_A : undefined),
      },
    });
    communities.start();

    await communities.receive(signal({ id: 'sig-secret-1', member: STRANGER }));
    await communities.receive(
      signal({ id: 'sig-secret-2', community: 'group-unknown' }),
    );
    await communities.receive(
      signal({ id: 'sig-secret-3', member: 'm'.repeat(MAX_PEER_LENGTH + 1) }),
    );
    messenger.failNext('blocked');
    bus.publish(assigned('e-1'));
    await bus.delivered();
    dispatch.broken = new BackendDown('секрет бэкенда');
    await communities.receive(signal({ id: 'sig-secret-4' }));
    bus.publish(assigned('e-2'));
    await bus.delivered();

    const text = JSON.stringify(logger.records);
    expect(logger.records.length).toBeGreaterThanOrEqual(8);
    expect(logger.records.every(({ source }) => source === 'chat-ui')).toBe(
      true,
    );
    for (const data of [
      GROUP,
      'group-unknown',
      KEY,
      MEMBER_A,
      MEMBER_B,
      STRANGER,
      'mmmm',
      A,
      B,
      TASK,
      TASK_ROW.title,
      'sig-secret',
      'секрет',
    ]) {
      expect(text).not.toContain(data);
    }
  });
});

describe('Communities — подписка реакций', () => {
  test('start() дважды без остановки — бросок', () => {
    const { communities } = sceneOf();
    communities.start();

    expect(() => communities.start()).toThrow();
  });

  test('после отписки события не исполняются; новый start подписывает снова', async () => {
    const { communities, bus, dispatch, messenger } = sceneOf();
    const stop = communities.start();

    stop();
    bus.publish(assigned('e-1'));
    await bus.delivered();

    expect(dispatch.requests).toEqual([]);
    expect(messenger.journal).toEqual([]);

    communities.start();
    bus.publish(assigned('e-2'));
    await bus.delivered();

    expect(messenger.journal).toHaveLength(1);
  });

  test('две реакции на одно событие — одна подписка, каждая реакция исполняется один раз', async () => {
    const bus = new CountingBus();
    const { communities, messenger, dispatch } = sceneOf({
      bus,
      community: { reactions: [DROP, ASK] },
    });
    communities.start();

    bus.publish(assigned('e-1'));
    await bus.delivered();

    expect(bus.subscriptions).toEqual(new Map([[TaskEvents.assigned.name, 1]]));
    expect(
      dispatch.requests
        .map((r) => (r.caller.toLog() as { from: { name: string } }).from.name)
        .sort(),
    ).toEqual([REACTION_NODE, 'exampleDialog/reaction-ask'].sort());
    expect(
      messenger.journal
        .map((entry) => (entry as { operation?: string }).operation)
        .sort(),
    ).toEqual(['exclude', 'invite']);
  });

  test('без реакций start не подписывается', () => {
    const bus = new CountingBus();
    const { communities } = sceneOf({ bus, community: { signals: [GONE] } });

    communities.start();

    expect(bus.subscriptions.size).toBe(0);
  });
});

describe('Communities — сборка', () => {
  /** Сборка на `messenger` (по умолчанию — editing с портом сообщества) и манифестах `community`. */
  const build = (
    community: ChatCommunitySpec,
    messenger: MessengerPort = MemoryMessenger.editing(),
  ) => thrown(() => sceneOf({ community, messenger }));

  test('манифест не прошёл CommunityManifest — бросок тем же текстом', () => {
    const community = { signals: [GONE, GONE] };
    const text = thrown(
      () => new CommunityManifest(ExampleDialogUiAppDef, community),
    );

    expect(text).not.toBe('');
    expect(build(community)).toBe(text);
  });

  test.each([
    [
      'UC реакции — command',
      {
        reactions: [
          { ...DROP, uc: RemoveUserUcDef, input: { userId: 'ownerId' } },
        ],
      },
      'drop',
      'не query',
    ],
    [
      'UC сигнала — query',
      { signals: [{ ...GONE, uc: GetUserUcDef, input: { userId: 'person' } }] },
      'gone',
      'не command',
    ],
    [
      'нет system в callers UC сигнала',
      {
        signals: [{ ...GONE, uc: CreateTaskUcDef, input: { title: 'person' } }],
      },
      'gone',
      'нет system в callers',
    ],
    [
      'нет system в callers UC реакции',
      {
        reactions: [{ ...DROP, uc: ListTasksUcDef, input: { page: 'taskId' } }],
      },
      'drop',
      'нет system в callers',
    ],
  ] as const)(
    '%s — бросок с именем приложения и манифеста и причиной',
    (_, community, name, reason) => {
      const text = build(community);

      expect(text).toContain('exampleDialog');
      expect(text).toContain(name);
      expect(text).toContain(reason);
    },
  );

  test('операция inviteLink (объявлена в возможностях editing) — бросок «не реализовано» с именем приложения и манифеста (С5-C)', () => {
    const text = build({ reactions: [{ ...DROP, operation: 'inviteLink' }] });

    expect(text).toContain('не реализовано');
    expect(text).toContain('exampleDialog');
    expect(text).toContain('drop');
  });

  test.each([
    [
      'сигнала нет в возможностях мессенджера',
      { signals: [GONE] },
      'gone',
      'не принимает сигнал left',
    ],
    [
      'операции нет в возможностях мессенджера',
      { reactions: [DROP] },
      'drop',
      'не исполняет exclude',
    ],
  ] as const)(
    '%s — бросок с именем приложения и манифеста и причиной',
    (_, community, name, reason) => {
      const partial: MessengerCapabilities = {
        ...EDITING,
        name: 'memory-partial',
        community: { signals: ['joined'], operations: ['invite'] },
      };
      const text = build(community, portOf(partial, new GatedCommunity()));

      expect(text).toContain('exampleDialog');
      expect(text).toContain(name);
      expect(text).toContain(reason);
    },
  );

  test('реакция есть, порта сообщества у мессенджера нет — бросок с причиной', () => {
    const text = build(COMMUNITY, portOf(EDITING));

    expect(text).toContain('exampleDialog');
    expect(text).toContain('нет порта сообщества');
  });

  // Закрепляющая: отклонение шага C — сигналам порт сообщества не нужен.
  test('только сигналы, порта сообщества нет — собирается', () => {
    expect(build({ signals: [GONE, ANYONE] }, portOf(EDITING))).toBe('');
  });

  test.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'предел limit %p — не целое ≥ 1: бросок сборки с именем приложения и предела',
    (value) => {
      for (const name of ['signals', 'reactions'] as const) {
        const text = thrown(() => sceneOf({ limit: { [name]: value } }));

        expect(text).toContain('exampleDialog');
        expect(text).toContain(`limit.${name}`);
      }
    },
  );

  test('предел limit 1 — собирается', () => {
    expect(thrown(() => sceneOf({ limit: { signals: 1, reactions: 1 } }))).toBe(
      '',
    );
  });

  test('без манифестов мессенджер без порта сообщества собирается', () => {
    expect(build({}, portOf(EDITING))).toBe('');
    expect(
      build(
        {},
        MemoryMessenger.windowed(() => T0),
      ),
    ).toBe('');
  });

  test('годные манифесты на editing собираются', () => {
    expect(build({ signals: [GONE, ANYONE], reactions: [DROP, ASK] })).toBe('');
  });
});
