import { describe, expect, test } from 'bun:test';
import { ErrorDef, ok } from 'dmg-core';
import {
  CompleteTaskUcDef,
  CreateTaskUcDef,
  TaskErrors,
} from 'dmg-core/testing/example';
import {
  TASK_A,
  TASK_B,
  type TaskListScreenDef,
} from '../../testing/ui-fixture';
import { TaskListScreenCode } from '../../testing/ui-fixture-code';
import {
  CARD_ID,
  fixtureCodes,
  LIST_ID,
  RuntimeKit,
  requestTrace,
} from '../../testing/ui-runtime-fixture';
import type { StateOf } from '../manifest/screen-def.types';
import type { ScreenInstance } from './screen-instance';

// Записи наблюдателя экрана: узел, след, экземпляр; без входа, данных и
// текстов замечаний. Сырой бросок кода — только в точку диагностики `faults`.

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

type ListState = StateOf<typeof TaskListScreenDef>;

/** Загрузка бросает чужую ошибку со значением в тексте. */
class LeakyLoad extends TaskListScreenCode {
  override async load(): Promise<never> {
    throw new TypeError('Секретное дело');
  }
}

/** `toggle` кладёт введённое значение в состояние не по схеме. */
class LeakyToggle extends TaskListScreenCode {
  override readonly locals = {
    toggle: (_: ListState, __: unknown, input: { taskId: string }) =>
      // Состояние не по схеме — сам сценарий теста.
      ({ selected: input.taskId }) as unknown as ListState,
  };
}

const defectsOf = (kit: RuntimeKit) =>
  kit.observer.records.filter((entry) => entry.kind === 'defect');

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

  test('чужой бросок кода — в defect этап и имя ошибки без текста, сам бросок — в faults', async () => {
    const kit = new RuntimeKit(fixtureCodes({ list: new LeakyLoad() }));

    await kit.openList();

    const [defect] = defectsOf(kit);
    expect(JSON.stringify(defect)).not.toContain('Секретное дело');
    expect(defect).toMatchObject({
      node: LIST_ID,
      text: expect.stringContaining('TypeError'),
    });
    expect(kit.faults).toEqual([
      {
        node: LIST_ID,
        trace: requestTrace('r-open'),
        error: expect.any(TypeError),
      },
    ]);
  });

  test('состояние не по схеме — в defect путь поля, без значения', async () => {
    const kit = new RuntimeKit(fixtureCodes({ list: new LeakyToggle() }));
    const list = await kit.openList();

    await list.local({ name: 'toggle', input: { taskId: TASK_A } });

    const [defect] = defectsOf(kit);
    expect(JSON.stringify(defect)).not.toContain(TASK_A);
    expect(defect).toMatchObject({ text: expect.stringContaining('selected') });
  });

  test('имя не из манифеста — acted и outcome с id экрана', async () => {
    const { kit, list } = await listWithCreate();

    await list.act({ action: 'чужое/имя', revision: 1, trace: actTrace });

    expect(kit.observer.records.slice(1).map((r) => r.node)).toEqual([
      LIST_ID,
      LIST_ID,
    ]);
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
