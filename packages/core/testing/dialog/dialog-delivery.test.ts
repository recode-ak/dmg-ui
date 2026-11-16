import { describe, expect, test } from 'bun:test';
import { Trace } from 'dmg-core';
import {
  AwaitingBus,
  MemoryLogger,
  testUuid,
  useTempDir,
} from 'dmg-core/testing';
import { ExampleApp, TaskEvents } from 'dmg-core/testing/example';
import {
  ApiAppDispatch,
  type DeliveredNotification,
  UiServer,
} from 'dmg-ui/server';
import {
  DialogChannel,
  ExampleDialogAppDef,
  ExampleUiSetDef,
  exampleCodes,
  exampleDialogViews,
  MemoryUiObserver,
} from '../index';
import { T0 } from '../ui-server-fixture';
import { DialogDelivery } from './dialog-delivery';

// Доставка уведомлений диалоговым каналом: реплика во входящие получателя,
// ссылки — варианты, отсев повтора по `cause.eventId`. Живой экран
// доставка не трогает.

const A = testUuid(1);
const B = testUuid(2);
const LIST = 'exampleUi/todo/taskList';
const ASSIGNED = 'exampleUi/todo/assignedTasks';
const tmp = useTempDir('dmg-ui-dialog-delivery-');

const channelOf = () => {
  const bus = new AwaitingBus();
  const context = { bus, logger: new MemoryLogger() };
  const example = new ExampleApp(
    { mode: 'test', dataDir: tmp().path, users: [A, B] },
    { ...context, clock: () => T0 },
  );
  return new DialogChannel({
    app: ExampleDialogAppDef,
    codes: exampleCodes(),
    server: new UiServer({
      set: ExampleUiSetDef,
      dispatch: new ApiAppDispatch(example.api),
      context,
    }),
    views: exampleDialogViews,
    observer: new MemoryUiObserver(),
    identities: () => example.callers,
  });
};

/** Уведомление «назначена задача Сыр» для B по событию `eventId`. */
const assigned = (eventId: string): DeliveredNotification => ({
  notification: 'exampleUi/todo/taskAssigned',
  recipient: B,
  data: { title: 'Сыр' },
  links: [{ screen: ASSIGNED, params: {} }],
  cause: { event: TaskEvents.assigned.name, eventId },
  trace: Trace.fromEvent({ eventId, correlationId: 'r-assign' }).toJSON(),
});

describe('DialogDelivery', () => {
  test('реплика во входящих получателя, варианты — ссылки; живой экран не тронут', async () => {
    const channel = channelOf();
    const b = channel.person(B);
    await b.start('start');
    const replies = b.replies.length;
    const screen = b.suspend();

    await channel.delivery.deliver(assigned('e-1'));

    expect(b.inbox).toHaveLength(1);
    expect(b.inbox[0]?.text).toContain('Сыр');
    expect(b.inbox[0]?.options.map((o) => o.label)).toEqual([
      'Назначенные мне',
    ]);
    expect(b.replies).toHaveLength(replies);
    expect(b.suspend()).toEqual(screen);
    expect(channel.person(A).inbox).toEqual([]);
  });

  test('повтор eventId — без второй реплики; другое событие — новая', async () => {
    const channel = channelOf();
    const b = channel.person(B);

    await channel.delivery.deliver(assigned('e-1'));
    await channel.delivery.deliver(assigned('e-1'));
    const afterRepeat = b.inbox.length;
    await channel.delivery.deliver(assigned('e-2'));

    expect(afterRepeat).toBe(1);
    expect(b.inbox).toHaveLength(2);
  });

  test('ссылка уведомления — открывает экран живым, прежний заменён', async () => {
    const channel = channelOf();
    const b = channel.person(B);
    await b.start('start');
    await channel.delivery.deliver(assigned('e-1'));
    const before = b.suspend().address;
    const link = b.inbox[0]?.options[0]?.ref;
    if (link === undefined) throw new Error('у уведомления нет ссылки');

    await b.press(link);

    expect(before).toEqual({ screen: LIST, params: { page: 0 } });
    expect(b.suspend().address).toEqual({ screen: ASSIGNED, params: {} });
  });
});

describe('DialogDelivery — сбой доставки', () => {
  test('бросок при доставке не ставит отсев: повтор того же eventId доставляется', async () => {
    const channel = channelOf();
    let calls = 0;
    const delivery = new DialogDelivery((uuid) => {
      calls += 1;
      if (calls === 1) throw new Error('сбой доставки');
      return channel.person(uuid);
    });

    const failed = delivery.deliver(assigned('e-1'));
    await expect(failed).rejects.toThrow('сбой доставки');
    await delivery.deliver(assigned('e-1'));

    expect(channel.person(B).inbox).toHaveLength(1);
  });
});
