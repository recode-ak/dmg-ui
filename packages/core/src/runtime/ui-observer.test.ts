import { describe, expect, test } from 'bun:test';
import { ErrorDef, ok } from 'dmg-core';
import {
  CompleteTaskUcDef,
  CreateTaskUcDef,
  TaskErrors,
} from 'dmg-core/testing/example';
import { TASK_B, TaskCardScreenDef } from '../../testing/ui-fixture';
import { TaskListScreenCode } from '../../testing/ui-fixture-code';
import {
  CARD_ID,
  fixtureCodes,
  LIST_ID,
  RuntimeKit,
  requestTrace,
} from '../../testing/ui-runtime-fixture';
import type { ScreenInstance } from './screen-instance';

// Записи наблюдателя экрана (критерий 13, решение 12 брифа Ф4): узел, след,
// экземпляр; без входа, данных и текстов замечаний.

const CREATE_ID = `${LIST_ID}/create`;
const actTrace = requestTrace('r-act');

/** Список, у которого `create` отвечает успехом. */
const listWithCreate = async (kit = new RuntimeKit()) => {
  kit.ucs.answer(CreateTaskUcDef, ok({ taskId: TASK_B }));
  return { kit, list: await kit.openList() };
};

/** Действие `create` с названием `title`. */
const create = (list: ScreenInstance, title: string) =>
  list.act({
    action: 'create',
    input: { title },
    revision: 1,
    trace: actTrace,
  });

/** `create` ведёт на экран вне `to` — дефект. */
class Jump extends TaskListScreenCode {
  override readonly actions = {
    ...new TaskListScreenCode().actions,
    create: { done: () => TaskCardScreenDef.at({ taskId: TASK_B }) },
  };
}

describe('UiObserver — записи экрана', () => {
  test('opened → acted → outcome: id действия, след и один экземпляр', async () => {
    const { kit, list } = await listWithCreate();

    await create(list, 'Хлеб');

    expect(kit.observer.records).toMatchObject([
      { kind: 'opened', node: LIST_ID, trace: requestTrace('r-open') },
      { kind: 'acted', node: CREATE_ID, trace: actTrace, revision: 1 },
      {
        kind: 'outcome',
        node: CREATE_ID,
        trace: actTrace,
        outcome: 'exited',
        exit: 'created',
      },
    ]);
    expect(new Set(kit.observer.records.map((r) => r.instance)).size).toBe(1);
  });

  test('отказ UC — запись refused с кодом и признаком перехвата', async () => {
    const kit = new RuntimeKit();
    kit.ucs.answer(CompleteTaskUcDef, {
      ok: false,
      error: ErrorDef.serialize(TaskErrors.ALREADY_DONE.make()),
    });
    const card = await kit.openCard();

    await card.act({ action: 'complete', revision: 1, trace: actTrace });

    expect(kit.observer.records).toContainEqual(
      expect.objectContaining({
        kind: 'refused',
        node: `${CARD_ID}/complete`,
        code: 'TASK_ALREADY_DONE',
        caught: false,
        trace: actTrace,
      }),
    );
  });

  test('дефект кода экрана — запись defect с текстом причины', async () => {
    const { kit, list } = await listWithCreate(
      new RuntimeKit(fixtureCodes({ list: new Jump() })),
    );

    await create(list, 'Хлеб');

    expect(kit.observer.records).toContainEqual(
      expect.objectContaining({
        kind: 'defect',
        node: CREATE_ID,
        text: expect.any(String),
      }),
    );
  });

  test('rejected — в записи только имена полей', async () => {
    const { kit, list } = await listWithCreate();

    await create(list, '');

    expect(kit.observer.records.at(-1)).toEqual({
      kind: 'outcome',
      node: CREATE_ID,
      trace: actTrace,
      instance: expect.any(String),
      outcome: 'rejected',
      fields: ['title'],
    });
  });

  test('в записях нет входа, данных и названия задачи (F.sensitive)', async () => {
    const { kit, list } = await listWithCreate();

    await create(list, 'Секретное дело');

    const json = JSON.stringify(kit.observer.records);
    expect(json).not.toContain('Секретное дело');
    expect(json).not.toContain('Хлеб');
    expect(json).not.toContain(TASK_B);
  });
});
