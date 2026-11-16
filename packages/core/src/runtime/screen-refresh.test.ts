import { describe, expect, test } from 'bun:test';
import { CoreErrors, ErrorDef, err, ok } from 'dmg-core';
import {
  CompleteTaskUcDef,
  ListTasksUcDef,
  TaskEvents,
} from 'dmg-core/testing/example';
import {
  LIST_ID,
  RuntimeKit,
  refreshSignal,
  requestTrace,
  TASKS,
} from '../../testing/ui-runtime-fixture';
import type { ViewChange } from './outcome.types';
import type { ScreenInstance } from './screen-instance';

// Перечитывание экземпляра по сигналу порта: сигнал без payload, `read`
// идёт со следом сигнала, очередь — общая с действиями. Подписка — до
// загрузки, экземпляр в отказе сигналов не получает, ожидающее
// перечитывание в очереди одно.

const created = refreshSignal(TaskEvents.created.name, 'e-1', 'r-create');
const denied = err(
  ErrorDef.serialize(
    CoreErrors.ACCESS_DENIED.make({ rule: 'isOwner', denyMessage: 'Нет' }),
  ),
);

/** Сигнал `created` с номером `n`. */
const createdN = (n: number) =>
  refreshSignal(TaskEvents.created.name, `e-${n}`, `r-${n}`);

/** Промис следующего изменения экземпляра. */
const nextChange = (instance: ScreenInstance) =>
  new Promise<void>((resolve) => {
    const off = instance.onChange(() => {
      off();
      resolve();
    });
  });

describe('ScreenInstance — перечитывание по сигналу', () => {
  test('сигнал — перечитывание: ревизия + 1, read со следом сигнала, запись refreshed', async () => {
    const kit = new RuntimeKit();
    const list = await kit.openList();
    const changed = nextChange(list);

    kit.refresh.emit(created);
    await changed;

    expect(list.view().revision).toBe(2);
    expect(kit.ucs.calls.at(-1)?.trace).toEqual(created.trace);
    expect(kit.observer.records.at(-1)).toMatchObject({
      kind: 'refreshed',
      node: LIST_ID,
      trace: created.trace,
      revision: 2,
    });
  });

  test('перечитывание по сигналу — onChange с причиной refreshed и новой ревизией', async () => {
    const kit = new RuntimeKit();
    const list = await kit.openList();
    const changes: ViewChange[] = [];
    list.onChange((change: ViewChange) => changes.push(change));
    const changed = nextChange(list);

    kit.refresh.emit(created);
    await changed;

    expect(changes).toEqual([{ cause: 'refreshed', revision: 2 }]);
  });

  test('сигнал во время действия ждёт его конца', async () => {
    const kit = new RuntimeKit();
    const release = kit.ucs.hold(CompleteTaskUcDef);
    const card = await kit.openCard();
    const acting = card.act({
      action: 'complete',
      revision: 1,
      trace: requestTrace('r-act'),
    });
    await Bun.sleep(0);

    kit.refresh.emit(refreshSignal(TaskEvents.completed.name, 'e-2'));
    await Bun.sleep(0);
    const callsWhileActing = kit.ucs.names();
    release(ok({}));

    expect(await acting).toEqual({ kind: 'stayed', revision: 2 });
    expect(callsWhileActing).toEqual(['listTasks', 'completeTask']);
  });

  test('close() снимает watch', async () => {
    const kit = new RuntimeKit();
    const list = await kit.openList();
    const watching = kit.refresh.watching();

    list.close();

    expect(watching).toEqual([{ screen: LIST_ID, params: { index: 0 } }]);
    expect(kit.refresh.watching()).toEqual([]);
  });
});

describe('ScreenInstance — подписка и загрузка', () => {
  test('подписка — до загрузки: сигналы загрузки дают одно перечитывание со следом последнего', async () => {
    const kit = new RuntimeKit();
    const release = kit.ucs.hold(ListTasksUcDef);
    const opening = kit.openList();
    await Bun.sleep(0);
    const watchingWhileLoading = kit.refresh.watching();
    kit.refresh.emit(createdN(1));
    kit.refresh.emit(createdN(2));
    release(ok([...TASKS]));
    const list = await opening;
    await nextChange(list);

    expect(watchingWhileLoading).toEqual([
      { screen: LIST_ID, params: { index: 0 } },
    ]);
    expect(list.view().revision).toBe(2);
    expect(kit.ucs.names()).toEqual(['listTasks', 'listTasks']);
    expect(kit.ucs.calls.at(-1)?.trace).toEqual(createdN(2).trace);
  });

  test('загрузка не ready — подписка снята, сигналы отброшены, ревизия 1', async () => {
    const kit = new RuntimeKit();
    const release = kit.ucs.hold(ListTasksUcDef);
    const opening = kit.openList();
    await Bun.sleep(0);
    kit.refresh.emit(created);
    release(denied);
    const list = await opening;
    await Bun.sleep(0);

    expect(list.view()).toMatchObject({ status: 'refused', revision: 1 });
    expect(kit.refresh.watching()).toEqual([]);
    expect(kit.ucs.names()).toEqual(['listTasks']);
  });

  test('перечитывание с отказом снимает подписку', async () => {
    const kit = new RuntimeKit();
    const list = await kit.openList();
    kit.ucs.answer(ListTasksUcDef, denied);
    const changed = nextChange(list);

    kit.refresh.emit(created);
    await changed;

    expect(list.view().status).toBe('refused');
    expect(kit.refresh.watching()).toEqual([]);
  });

  test('сигналы во время действия — одно перечитывание со следом последнего', async () => {
    const kit = new RuntimeKit();
    const release = kit.ucs.hold(CompleteTaskUcDef);
    const card = await kit.openCard();
    const acting = card.act({
      action: 'complete',
      revision: 1,
      trace: requestTrace('r-act'),
    });
    await Bun.sleep(0);
    for (const n of [1, 2, 3]) kit.refresh.emit(createdN(n));
    release(ok({}));
    await acting;
    await nextChange(card);

    expect(kit.ucs.names()).toEqual([
      'listTasks',
      'completeTask',
      'listTasks',
      'listTasks',
    ]);
    expect(kit.ucs.calls.at(-1)?.trace).toEqual(createdN(3).trace);
  });

  test('бросок слушателя onChange не рвёт действие: исход и запись outcome есть, бросок — в faults', async () => {
    const kit = new RuntimeKit();
    kit.ucs.answer(CompleteTaskUcDef, ok({}));
    const card = await kit.openCard();
    const boom = new Error('слушатель');
    card.onChange(() => {
      throw boom;
    });

    const outcome = await card.act({
      action: 'complete',
      revision: 1,
      trace: requestTrace('r-act'),
    });

    expect(outcome).toEqual({ kind: 'stayed', revision: 2 });
    expect(kit.observer.kinds().at(-1)).toBe('outcome');
    expect(kit.faults.map((fault) => fault.error)).toEqual([boom]);
  });
});
