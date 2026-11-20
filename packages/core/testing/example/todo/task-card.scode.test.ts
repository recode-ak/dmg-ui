import { describe, expect, test } from 'bun:test';
import { ok } from 'dmg-core';
import { testUuid } from 'dmg-core/testing';
import { ListTasksUcDef } from 'dmg-core/testing/example';
import type { InstanceView } from 'dmg-ui';
import { type TaskStateRow, taskState } from '../../task-state';
import { RuntimeKit, requestTrace } from '../../ui-runtime.fixture';
import { CARD_ID, TASK_A } from './example-tasks';
import { TaskCardScreenDef } from './task-card.screen';

// Карточка задачи: «Выполнить» и «Назначить» решает Policy над задачей из
// state (`TaskAr.readonly`), «Выполнить» — ещё и статус. Чужому действия
// скрыты, выполненная задача отключает «Выполнить» с причиной. «Напомнить» —
// действие без UC с полями булева и даты; доступно, как «Выполнить».

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

describe('экран taskCard: remind — напоминание без UC', () => {
  /** Карточка с `kit`: по нему видно, какие UC ушли. */
  const cardKit = async (row: TaskStateRow) => {
    const kit = new RuntimeKit();
    kit.ucs.answer(ListTasksUcDef, ok([row]));
    const card = await kit.runtime.open(
      TaskCardScreenDef.at({ taskId: TASK_A }),
      RuntimeKit.options(),
    );
    return { kit, card };
  };

  const remindWith = (
    card: Awaited<ReturnType<typeof cardKit>>['card'],
    input: unknown,
  ) =>
    card.act({
      action: 'remind',
      input,
      revision: 1,
      trace: requestTrace('r-remind'),
    });

  const fieldsOf = (view: InstanceView) =>
    view.actions.find((action) => action.name === 'remind')?.fields;

  test('своя открытая задача — доступно', async () => {
    const card = await cardOf(task());

    expect(answerOf(card.view(), 'remind')).toEqual({ kind: 'available' });
  });

  test('своя выполненная — отключено с причиной «Задача уже выполнена»', async () => {
    const card = await cardOf(task({ status: 'done' }));

    expect(answerOf(card.view(), 'remind')).toEqual({
      kind: 'disabled',
      text: 'Задача уже выполнена',
    });
  });

  test('чужая открытая задача — скрыто', async () => {
    const card = await cardOf(task({ ownerId: OTHER }));

    expect(answerOf(card.view(), 'remind')).toEqual({ kind: 'hidden' });
  });

  test('чужая выполненная — скрыто: скрытое сильнее отключённого', async () => {
    const card = await cardOf(task({ status: 'done', ownerId: OTHER }));

    expect(answerOf(card.view(), 'remind')).toEqual({ kind: 'hidden' });
  });

  test('администратор — чужая открытая задача доступна', async () => {
    const card = await cardOf(task({ ownerId: OTHER }), { subject: admin });

    expect(answerOf(card.view(), 'remind')).toEqual({ kind: 'available' });
  });

  test('субъекта нет — скрыто', async () => {
    const card = await cardOf(task(), { subject: undefined });

    expect(answerOf(card.view(), 'remind')).toEqual({ kind: 'hidden' });
  });

  test('поля в виде: urgent — булево с подсказкой без примера, remindOn — дата с подсказкой и примером; оба обязательные', async () => {
    const card = await cardOf(task());

    const fields = fieldsOf(card.view());

    expect(fields).toHaveLength(2);
    expect(fields?.[0]).toMatchObject({
      name: 'urgent',
      label: 'Срочно',
      kind: 'boolean',
      optional: false,
      hint: 'Срочное напоминание придёт сразу',
    });
    expect(fields?.[0]).not.toHaveProperty('example');
    expect(fields?.[1]).toMatchObject({
      name: 'remindOn',
      label: 'Когда',
      kind: 'date',
      optional: false,
      hint: 'День напоминания',
      example: '2026-12-31',
    });
  });

  test('«завтра» — rejected текстом схемы у поля remindOn, UC не вызван', async () => {
    const { kit, card } = await cardKit(task());
    const before = kit.ucs.names();

    const outcome = await remindWith(card, {
      urgent: false,
      remindOn: 'завтра',
    });

    expect(outcome).toEqual({
      kind: 'rejected',
      issues: [{ field: 'remindOn', text: 'Дата в виде ГГГГ-ММ-ДД' }],
    });
    expect(kit.ucs.names()).toEqual(before);
  });

  test('верный вход — остаётся на той же карточке (stayed), записывающих UC нет: только перечитывание списка', async () => {
    const { kit, card } = await cardKit(task());

    const outcome = await remindWith(card, {
      urgent: true,
      remindOn: '2026-12-31',
    });

    expect(outcome).toMatchObject({ kind: 'stayed' });
    expect(card.view().address).toEqual({
      screen: CARD_ID,
      params: { taskId: TASK_A },
    });
    expect(kit.ucs.names().filter((name) => name !== 'listTasks')).toEqual([]);
  });
});
