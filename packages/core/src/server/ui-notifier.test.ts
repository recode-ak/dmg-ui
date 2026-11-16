import { describe, expect, test } from 'bun:test';
import {
  CoreErrors,
  ErrorDef,
  ok,
  type SerializedResult,
  SystemCaller,
  type TraceJson,
} from 'dmg-core';
import { ModuleApi } from 'dmg-core/app';
import { AwaitingBus, MemoryLogger, testUuid } from 'dmg-core/testing';
import {
  GetTaskUcDef,
  TaskEvents,
  TodoModuleDef,
} from 'dmg-core/testing/example';
import {
  ASSIGNED_ID,
  exampleCodes,
  OWNER,
  TASK_A,
  TaskCardScreenDef,
} from '../../testing/example';
import { ExampleDialogAppDef } from '../../testing/example/dialog/example-dialog.app';
import { TaskAssignedNotificationCode } from '../../testing/example/todo/task-assigned.code';
import { MemoryUiObserver } from '../../testing/memory-ui-observer';
import { UiScene } from '../../testing/ui-arch';
import { TASKS } from '../../testing/ui-runtime-fixture';
import {
  envelopeOf,
  StubDelivery,
  StubRecipientCallers,
  StubTransport,
} from '../../testing/ui-server-fixture';
import type { AnyNotificationDef } from '../manifest/notification-def';
import type { AnyUiAppDef } from '../manifest/ui-app-def';
import { CodeLoader, CodeLoaders } from '../runtime/code-loaders';
import { NotificationCode } from '../runtime/notification-code';
import { ModuleApiDispatch } from './module-api-dispatch';
import { UiNotifier } from './ui-notifier';

// Уведомления приложения UI: получатели, чтение от
// имени получателя по следу события, ссылки только из `links()`, записи
// наблюдателя без payload.

const ASSIGNEE = testUuid(7);
/** Выход `listAssignedTasks` получателя: задачи владельца `OWNER`. */
const ASSIGNED_TASKS = TASKS.map((task) => ({ ...task, ownerId: OWNER }));
const N_ID = 'exampleUi/todo/taskAssigned';
const OWNER_N_ID = 'miniUi/todo/taskOwner';
const eventTrace: TraceJson = {
  cause: { kind: 'event', eventId: 'e-1' },
  correlationId: 'r-assign',
};
const assigned = envelopeOf(
  TaskEvents.assigned,
  { taskId: TASK_A, ownerId: OWNER, assigneeId: ASSIGNEE },
  'e-1',
  'r-assign',
);

/** Получатель — владелец задачи из выхода `getTask`. */
const ownerNotification = UiScene.notification('taskOwner', {
  recipients: {
    from: 'query',
    uc: GetTaskUcDef,
    input: { taskId: 'taskId' },
    fields: ['ownerId'],
  },
});

const ownerScene = new UiScene({
  screens: [],
  notifications: [ownerNotification],
});

class OwnerCode extends NotificationCode<AnyNotificationDef> {
  override async load() {
    return ok({});
  }
}

const ownerCodes = () =>
  CodeLoaders.of(ownerScene.set, [
    CodeLoader.notification(ownerNotification, async () => new OwnerCode()),
  ]);

type Setup = {
  readonly app?: AnyUiAppDef;
  readonly codes?: CodeLoaders;
  readonly callers?: StubRecipientCallers;
  readonly delivery?: StubDelivery;
  /** Ответы транспорта сверх `listAssignedTasks`. */
  readonly answers?: Readonly<Record<string, SerializedResult>>;
  readonly transport?: StubTransport;
  /** Событие вместо `assigned`. */
  readonly envelope?: ReturnType<typeof envelopeOf>;
};

/** Уведомитель на заглушках; событие `assigned` уже опубликовано и доставлено. */
const notify = async (over: Setup = {}) => {
  const bus = new AwaitingBus();
  const logger = new MemoryLogger();
  const transport = (over.transport ?? new StubTransport()).answer(
    'listAssignedTasks',
    ok(ASSIGNED_TASKS),
  );
  for (const [uc, result] of Object.entries(over.answers ?? {})) {
    transport.answer(uc, result);
  }
  const delivery = over.delivery ?? new StubDelivery();
  const observer = new MemoryUiObserver();
  new UiNotifier({
    app: over.app ?? ExampleDialogAppDef,
    codes: over.codes ?? exampleCodes(),
    dispatch: new ModuleApiDispatch([
      new ModuleApi(TodoModuleDef, transport, logger),
    ]),
    callers: over.callers ?? new StubRecipientCallers(),
    delivery,
    observer,
    context: { bus, logger },
  }).start();
  bus.publish(over.envelope ?? assigned);
  await bus.delivered();
  return { logger, transport, delivery, observer };
};

describe('UiNotifier — получатели из payload', () => {
  test('доставка получателю: данные, ссылки, причина-событие и след', async () => {
    const { delivery } = await notify();

    expect(delivery.delivered).toEqual([
      {
        notification: N_ID,
        recipient: ASSIGNEE,
        data: { title: 'Хлеб' },
        links: [{ screen: ASSIGNED_ID, params: {} }],
        cause: { event: TaskEvents.assigned.name, eventId: 'e-1' },
        trace: eventTrace,
      },
    ]);
  });

  test('read идёт от Caller получателя и со следом события', async () => {
    const { transport } = await notify();

    const [read] = transport.sent;
    expect(read?.module).toBe('todo');
    expect(read?.command.uc).toBe('listAssignedTasks');
    expect(read?.caller.subject()?.uuid).toBe(ASSIGNEE);
    expect(read?.trace.toJSON()).toEqual(eventTrace);
  });

  test('задачи нет среди поручений получателя — TASK_NOT_FOUND, доставки нет', async () => {
    const { delivery, observer } = await notify({
      answers: { listAssignedTasks: ok([]) },
    });

    expect(delivery.delivered).toEqual([]);
    expect(observer.records).toContainEqual(
      expect.objectContaining({
        kind: 'refused',
        node: N_ID,
        code: 'TASK_NOT_FOUND',
      }),
    );
  });

  test('отказ резолвера получателя — доставки нет, запись refused', async () => {
    const denied = CoreErrors.DELEGATION_DENIED.make({ reason: 'revoked' });
    const callers = new StubRecipientCallers(new Map([[ASSIGNEE, denied]]));

    const { delivery, observer, transport } = await notify({ callers });

    expect(delivery.delivered).toEqual([]);
    expect(transport.sent).toEqual([]);
    expect(observer.records).toContainEqual(
      expect.objectContaining({
        kind: 'refused',
        node: N_ID,
        code: 'DELEGATION_DENIED',
      }),
    );
  });
});

describe('UiNotifier — внутренний путь вызова', () => {
  test('read уведомления: след события, причина — eventId, correlationId — цепочка запроса события, не eventId', async () => {
    const { transport } = await notify({
      envelope: envelopeOf(
        TaskEvents.assigned,
        { taskId: TASK_A, ownerId: OWNER, assigneeId: ASSIGNEE },
        'e-9',
        'r-chain',
      ),
    });

    expect(transport.sent.map((s) => s.trace.toJSON())).toEqual([
      { cause: { kind: 'event', eventId: 'e-9' }, correlationId: 'r-chain' },
    ]);
  });
});

describe('UiNotifier — получатели из выхода query UC', () => {
  test('получатели — поля выхода UC, вызванного системой от приложения UI', async () => {
    const { delivery, transport } = await notify({
      app: ownerScene.app,
      codes: ownerCodes(),
      answers: { getTask: ok({ uuid: TASK_A, ownerId: OWNER }) },
    });

    const query = transport.sent.find(
      (s) => s.command.uc === GetTaskUcDef.name,
    );
    expect(query?.command.input).toEqual({ taskId: TASK_A });
    expect(query?.caller).toBeInstanceOf(SystemCaller);
    expect(query?.caller).toMatchObject({ from: { kind: 'app' } });
    expect(delivery.delivered).toMatchObject([{ recipient: OWNER }]);
  });
});

describe('UiNotifier — дефекты, сбои и записи', () => {
  test('ссылка на экран вне links() — дефект, доставки нет', async () => {
    class ForeignLink extends TaskAssignedNotificationCode {
      override links() {
        return [TaskCardScreenDef.at({ taskId: TASK_A })];
      }
    }

    const { delivery, observer } = await notify({
      codes: exampleCodes({ assignedNote: new ForeignLink() }),
    });

    expect(delivery.delivered).toEqual([]);
    expect(observer.records).toContainEqual(
      expect.objectContaining({ kind: 'defect', node: N_ID }),
    );
  });

  test('сбой доставки — logger.error без данных уведомления', async () => {
    class FailingDelivery extends StubDelivery {
      override async deliver(): Promise<void> {
        throw new Error('канал недоступен');
      }
    }

    const { logger } = await notify({ delivery: new FailingDelivery() });

    expect(JSON.stringify(logger.records)).not.toContain('Хлеб');
    expect(logger.records.map(({ level, meta }) => ({ level, meta }))).toEqual([
      {
        level: 'error',
        meta: {
          notification: N_ID,
          event: TaskEvents.assigned.name,
          eventId: 'e-1',
          error: 'канал недоступен',
        },
      },
    ]);
  });

  test('запись notified — получатель, eventId и след, без payload и данных', async () => {
    const { observer } = await notify();

    // `not.toContain` — до асимметричного сравнения: в Bun 1.4.4 после него
    // отрицание в том же тесте ложно проходит.
    const json = JSON.stringify(observer.records);
    expect(json).not.toContain(TASK_A);
    expect(json).not.toContain(OWNER);
    expect(json).not.toContain('Хлеб');
    expect(observer.records).toContainEqual(
      expect.objectContaining({
        kind: 'notified',
        node: N_ID,
        recipient: ASSIGNEE,
        eventId: 'e-1',
        trace: eventTrace,
      }),
    );
  });
});

describe('UiNotifier — сборка и запуск', () => {
  const build = (codes = exampleCodes()) => {
    const logger = new MemoryLogger();
    return new UiNotifier({
      app: ExampleDialogAppDef,
      codes,
      dispatch: new ModuleApiDispatch([
        new ModuleApi(TodoModuleDef, new StubTransport(), logger),
      ]),
      callers: new StubRecipientCallers(),
      delivery: new StubDelivery(),
      observer: new MemoryUiObserver(),
      context: { bus: new AwaitingBus(), logger },
    });
  };

  test('загрузчики другого набора — бросок', () => {
    expect(() => build(ownerCodes())).toThrow('UiNotifier');
  });

  test('повторный start() без остановки — бросок', () => {
    const notifier = build();
    notifier.start();

    expect(() => notifier.start()).toThrow('UiNotifier');
  });

  test('после остановки start() снова допустим', () => {
    const notifier = build();
    const stop = notifier.start();

    stop();

    expect(() => notifier.start()).not.toThrow();
  });
});

describe('UiNotifier — отказы и дефекты в логе', () => {
  test('отказ UC получателей — запись refused и logger.warn', async () => {
    const denied = CoreErrors.ACCESS_DENIED.make({
      rule: 'canManage',
      denyMessage: 'нет человека',
    });
    const { delivery, logger, observer } = await notify({
      app: ownerScene.app,
      codes: ownerCodes(),
      answers: { getTask: { ok: false, error: ErrorDef.serialize(denied) } },
    });

    expect(delivery.delivered).toEqual([]);
    expect(JSON.stringify(logger.records)).not.toContain('нет человека');
    expect(logger.records.map(({ level, meta }) => ({ level, meta }))).toEqual([
      {
        level: 'warn',
        meta: {
          notification: OWNER_N_ID,
          eventId: 'e-1',
          code: 'ACCESS_DENIED',
        },
      },
    ]);
    expect(observer.records).toContainEqual(
      expect.objectContaining({ kind: 'refused', code: 'ACCESS_DENIED' }),
    );
  });

  test('сбой бэкенда UC получателей — refused SERVER_INTERNAL и error, не defect', async () => {
    const transport = new StubTransport();
    transport.send = async () => {
      throw new Error('сеть');
    };
    const { logger, observer } = await notify({
      app: ownerScene.app,
      codes: ownerCodes(),
      transport,
    });

    expect(observer.kinds()).toEqual(['refused']);
    expect(logger.records.map(({ level, meta }) => ({ level, meta }))).toEqual([
      {
        level: 'error',
        meta: {
          notification: OWNER_N_ID,
          event: TaskEvents.assigned.name,
          eventId: 'e-1',
          error: 'сеть',
        },
      },
    ]);
    expect(observer.records).toContainEqual(
      expect.objectContaining({ kind: 'refused', code: 'SERVER_INTERNAL' }),
    );
  });

  test('бросок кода уведомления — defect без message и logger.error', async () => {
    class Throwing extends TaskAssignedNotificationCode {
      override async load(): Promise<never> {
        throw new Error('секрет Хлеб');
      }
    }

    const { logger, observer } = await notify({
      codes: exampleCodes({ assignedNote: new Throwing() }),
    });

    expect(JSON.stringify(observer.records)).not.toContain('секрет');
    // Текст броска идёт в лог сервера как есть, наблюдателю — нет.
    expect(logger.records.map(({ level, meta }) => ({ level, meta }))).toEqual([
      {
        level: 'error',
        meta: {
          notification: N_ID,
          event: TaskEvents.assigned.name,
          eventId: 'e-1',
          error: 'секрет Хлеб',
        },
      },
    ]);
    expect(observer.records).toContainEqual(
      expect.objectContaining({ kind: 'defect', node: N_ID }),
    );
  });
});

describe('UiNotifier — внутренний путь чтения', () => {
  test('длинный correlationId события не срывает чтение и доставку', async () => {
    const long = envelopeOf(
      TaskEvents.assigned,
      { taskId: TASK_A, ownerId: OWNER, assigneeId: ASSIGNEE },
      'e-1',
      'r'.repeat(300),
    );

    const { delivery, transport } = await notify({ envelope: long });

    expect(transport.names()).toEqual(['listAssignedTasks']);
    expect(delivery.delivered).toHaveLength(1);
  });
});
