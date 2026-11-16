import { describe, expect, test } from 'bun:test';
import { ok } from 'dmg-core';
import { CompleteTaskUcDef, TaskEvents } from 'dmg-core/testing/example';
import {
  ExampleUiSetDef,
  TASK_A,
  TaskCardScreenDef,
} from '../../testing/ui-fixture';
import {
  fixtureCodes,
  jsonPorts,
  RuntimeKit,
  refreshSignal,
  requestTrace,
} from '../../testing/ui-runtime-fixture';
import { ScreenRuntime } from './screen-runtime';

// Задел критерия 11 брифа Ф4: исполнитель работает через JSON-провод —
// вызов, ответ, адрес и сигнал переживают `JSON.stringify`/`parse`.

/** Открытие карточки → действие → перечитывание; `wrap` — порты через JSON. */
const scenario = async (wrap: boolean) => {
  const kit = new RuntimeKit();
  kit.ucs.answer(CompleteTaskUcDef, ok({}));
  const ports = wrap
    ? jsonPorts(kit.ucs, kit.refresh)
    : { ucs: kit.ucs, refresh: kit.refresh };
  const runtime = new ScreenRuntime({
    set: ExampleUiSetDef,
    codes: fixtureCodes(),
    observer: kit.observer,
    ...ports,
  });
  const card = await runtime.open(
    TaskCardScreenDef.at({ taskId: TASK_A }),
    RuntimeKit.options(),
  );
  const acted = await card.act({
    action: 'complete',
    revision: 1,
    trace: requestTrace('r-act'),
  });
  const changed = new Promise<void>((resolve) => card.onChange(resolve));
  kit.refresh.emit(refreshSignal(TaskEvents.completed.name, 'e-1'));
  await changed;
  return { acted, view: card.view(), calls: kit.ucs.calls };
};

describe('ScreenRuntime — граница JSON', () => {
  test('открытие → действие → перечитывание через JSON-порты дают те же исходы', async () => {
    expect(await scenario(true)).toEqual(await scenario(false));
  });
});
