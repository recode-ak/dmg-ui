import { describe, expect, test } from 'bun:test';
import {
  CoreErrors,
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
import { UiScene } from '../../testing/ui-arch';
import {
  ExampleUiAppDef,
  OWNER,
  TASK_A,
  TaskListScreenDef,
} from '../../testing/ui-fixture';
import { TaskAssignedNotificationCode } from '../../testing/ui-notification-code';
import {
  CARD_ID,
  fixtureCodes,
  MemoryUiObserver,
  TASKS,
} from '../../testing/ui-runtime-fixture';
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

// Уведомления приложения UI (решение 11 брифа Ф4): получатели, чтение от
// имени получателя по следу события, ссылки только из `links()`, записи
// наблюдателя без payload.

const ASSIGNEE = testUuid(7);
const N_ID = 'exampleUi/todo/taskAssigned';
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

/** Получатель — владелец задачи из выхода `getTask` (С-6). */
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
  /** Ответы транспорта сверх `listTasks`. */
  readonly answers?: Readonly<Record<string, SerializedResult>>;
};

/** Уведомитель на заглушках; событие `assigned` уже опубликовано и доставлено. */
const notify = async (over: Setup = {}) => {
  const bus = new AwaitingBus();
  const logger = new MemoryLogger();
  const transport = new StubTransport().answer('listTasks', ok([...TASKS]));
  for (const [uc, result] of Object.entries(over.answers ?? {})) {
    transport.answer(uc, result);
  }
  const delivery = over.delivery ?? new StubDelivery();
  const observer = new MemoryUiObserver();
  new UiNotifier({
    app: over.app ?? ExampleUiAppDef,
    codes: over.codes ?? fixtureCodes(),
    dispatch: new ModuleApiDispatch([
      new ModuleApi(TodoModuleDef, transport, logger),
    ]),
    callers: over.callers ?? new StubRecipientCallers(),
    delivery,
    observer,
    context: { bus, logger },
  }).start();
  bus.publish(assigned);
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
        links: [{ screen: CARD_ID, params: { taskId: TASK_A } }],
        cause: { event: TaskEvents.assigned.name, eventId: 'e-1' },
        trace: eventTrace,
      },
    ]);
  });

  test('read идёт от Caller получателя и со следом события', async () => {
    const { transport } = await notify();

    const [read] = transport.sent;
    expect(read?.command.uc).toBe('listTasks');
    expect(read?.caller.subject()?.uuid).toBe(ASSIGNEE);
    expect(read?.trace.toJSON()).toEqual(eventTrace);
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

describe('UiNotifier — получатели из выхода query UC (С-6)', () => {
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
        return [TaskListScreenDef.at({ index: 0 })];
      }
    }

    const { delivery, observer } = await notify({
      codes: fixtureCodes({ notification: new ForeignLink() }),
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

    expect(logger.records.map((r) => r.level)).toContain('error');
    expect(JSON.stringify(logger.records)).not.toContain('Хлеб');
  });

  test('запись notified — получатель, eventId и след, без payload и данных', async () => {
    const { observer } = await notify();

    expect(observer.records).toContainEqual(
      expect.objectContaining({
        kind: 'notified',
        node: N_ID,
        recipient: ASSIGNEE,
        eventId: 'e-1',
        trace: eventTrace,
      }),
    );
    const json = JSON.stringify(observer.records);
    expect(json).not.toContain(TASK_A);
    expect(json).not.toContain(OWNER);
    expect(json).not.toContain('Хлеб');
  });
});
