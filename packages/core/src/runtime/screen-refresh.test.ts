import { describe, expect, test } from 'bun:test';
import { ok } from 'dmg-core';
import { CompleteTaskUcDef, TaskEvents } from 'dmg-core/testing/example';
import {
  LIST_ID,
  RuntimeKit,
  refreshSignal,
  requestTrace,
} from '../../testing/ui-runtime-fixture';
import type { ScreenInstance } from './screen-instance';

// Перечитывание экземпляра по сигналу порта (решение 10 брифа Ф4): сигнал
// без payload, `read` идёт со следом сигнала, очередь — общая с действиями.

const created = refreshSignal(TaskEvents.created.name, 'e-1', 'r-create');

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
