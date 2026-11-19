import { describe, expect, test } from 'bun:test';
import { ok } from 'dmg-core';
import { testUuid } from 'dmg-core/testing';
import { ListTasksUcDef } from 'dmg-core/testing/example';
import type { InstanceView } from 'dmg-ui';
import { type TaskStateRow, taskState } from '../../task-state';
import { RuntimeKit } from '../../ui-runtime-fixture';
import { TASK_A } from './example-tasks';
import { TaskCardScreenDef } from './task-card.screen';

// Карточка задачи: «Выполнить» и «Назначить» решает Policy над задачей из
// state (`TaskAr.readonly`), «Выполнить» — ещё и статус. Чужому действия
// скрыты, выполненная задача отключает «Выполнить» с причиной.

const OTHER = testUuid(2);
const ADMIN = testUuid(3);
const admin = { uuid: ADMIN, hasRole: (role: string) => role === 'admin' };

const task = (spec: Partial<TaskStateRow> = {}) =>
  taskState({ uuid: TASK_A, title: 'Хлеб', status: 'open', ...spec });

/** Карточка `TASK_A`: `listTasks` отвечает `rows`; `context` — поверх контекста по умолчанию. */
const cardOf = async (
  row: TaskStateRow,
  context: Parameters<RuntimeKit['openList']>[0] = {},
) => {
  const kit = new RuntimeKit();
  kit.ucs.answer(ListTasksUcDef, ok([row]));
  return kit.runtime.open(
    TaskCardScreenDef.at({ taskId: TASK_A }),
    RuntimeKit.options(context),
  );
};

/** Ответ о действии из вида: скрытого в виде нет. */
const answerOf = (view: InstanceView, name: string) =>
  view.actions.find((action) => action.name === name)?.availability ?? {
    kind: 'hidden',
  };

describe('экран taskCard: complete', () => {
  test('владелец открытой задачи — доступно', async () => {
    const card = await cardOf(task());

    expect(answerOf(card.view(), 'complete')).toEqual({ kind: 'available' });
  });

  test('чужая открытая задача — скрыто', async () => {
    const card = await cardOf(task({ ownerId: OTHER }));

    expect(answerOf(card.view(), 'complete')).toEqual({ kind: 'hidden' });
  });

  test('администратор — чужая открытая задача доступна', async () => {
    const card = await cardOf(task({ ownerId: OTHER }), { subject: admin });

    expect(answerOf(card.view(), 'complete')).toEqual({ kind: 'available' });
  });

  test('своя выполненная задача — отключено с причиной', async () => {
    const card = await cardOf(task({ status: 'done' }));

    expect(answerOf(card.view(), 'complete')).toEqual({
      kind: 'disabled',
      text: 'Задача уже выполнена',
    });
  });

  test('чужая выполненная — скрыто: скрытое сильнее отключённого', async () => {
    const card = await cardOf(task({ status: 'done', ownerId: OTHER }));

    expect(answerOf(card.view(), 'complete')).toEqual({ kind: 'hidden' });
  });

  test('субъекта нет — скрыто', async () => {
    const card = await cardOf(task(), { subject: undefined });

    expect(answerOf(card.view(), 'complete')).toEqual({ kind: 'hidden' });
  });
});

describe('экран taskCard: assign и back', () => {
  test('assign — владельцу и администратору доступно, чужому скрыто', async () => {
    const own = await cardOf(task());
    const foreign = await cardOf(task({ ownerId: OTHER }));
    const asAdmin = await cardOf(task({ ownerId: OTHER }), { subject: admin });

    expect(answerOf(own.view(), 'assign')).toEqual({ kind: 'available' });
    expect(answerOf(foreign.view(), 'assign')).toEqual({ kind: 'hidden' });
    expect(answerOf(asAdmin.view(), 'assign')).toEqual({ kind: 'available' });
  });

  test('assign без субъекта — скрыто', async () => {
    const card = await cardOf(task(), { subject: undefined });

    expect(answerOf(card.view(), 'assign')).toEqual({ kind: 'hidden' });
  });

  test('back не зависит от субъекта: доступно и чужому', async () => {
    const card = await cardOf(task({ ownerId: OTHER }));

    expect(answerOf(card.view(), 'back')).toEqual({ kind: 'available' });
  });
});
