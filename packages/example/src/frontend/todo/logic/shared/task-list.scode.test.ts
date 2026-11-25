import { describe, expect, test } from 'bun:test';
import { ok } from 'dmg-core';
import { testUuid } from 'dmg-core/testing';
import { ListTasksUcDef } from 'dmg-core/testing/example';
import type { InstanceView } from 'dmg-ui';
import { RuntimeKit, requestTrace } from 'dmg-ui/testing/fixtures';
import {
  LIST_ID,
  TASK_A,
  TASK_B,
  TaskListScreenDef,
  taskState,
} from '../../../../platform/ui';
import type { TaskStateRow } from '../../../../platform/ui/todo/shared/task-state';

// Список задач: доступность действий решает код экрана — правило домена
// над state задач (предел открытых), Policy над выбранными и условия по
// данным и состоянию. Выделение — локальное действие: сервер не зовётся.

const TASK_C = testUuid(31);
const TASK_D = testUuid(32);
const OTHER = testUuid(2);
const ADMIN = testUuid(3);
const admin = { uuid: ADMIN, hasRole: (role: string) => role === 'admin' };

const open = (uuid: string, ownerId?: string) =>
  taskState({
    uuid,
    title: uuid.slice(-2),
    status: 'open',
    ...(ownerId ? { ownerId } : {}),
  });
const done = (uuid: string) =>
  taskState({ uuid, title: 'Готово', status: 'done' });

/** Список с ответом `listTasks` из `rows`; `context` — поверх контекста по умолчанию. */
const listOf = async (
  rows: readonly TaskStateRow[],
  context: Parameters<RuntimeKit['openList']>[0] = {},
  page = 0,
) => {
  const kit = new RuntimeKit();
  kit.ucs.answer(ListTasksUcDef, ok([...rows]));
  const list = await kit.runtime.open(
    TaskListScreenDef.at({ page }),
    RuntimeKit.options(context),
  );
  return { kit, list };
};

/** Ответ о действии из вида: скрытого в виде нет. */
const answerOf = (view: InstanceView, name: string) =>
  [...view.actions, ...view.locals].find((item) => item.name === name)
    ?.availability ?? { kind: 'hidden' };

const select = (list: Awaited<ReturnType<typeof listOf>>['list'], id: string) =>
  list.local({ name: 'toggle', input: { taskId: id } });

describe('экран taskList: create — правило предела открытых задач', () => {
  test('два открытых и выполненная — доступно', async () => {
    const { list } = await listOf([open(TASK_A), open(TASK_B), done(TASK_C)]);

    expect(answerOf(list.view(), 'create')).toEqual({ kind: 'available' });
  });

  test('три открытых — отключено текстом правила, на странице их две', async () => {
    const { list } = await listOf([open(TASK_A), open(TASK_B), open(TASK_C)]);

    expect(answerOf(list.view(), 'create')).toStrictEqual({
      kind: 'disabled',
      text: 'Слишком много открытых задач',
    });
    expect(list.view().data).toMatchObject({
      tasks: [{ uuid: TASK_A }, { uuid: TASK_B }],
      owned: [{ uuid: TASK_A }, { uuid: TASK_B }, { uuid: TASK_C }],
    });
  });

  test('предел считается по всем задачам владельца, а не по странице', async () => {
    const rows = [open(TASK_A), open(TASK_B), open(TASK_C), open(TASK_D)];

    const { list } = await listOf(rows, {}, 1);

    expect(answerOf(list.view(), 'create').kind).toBe('disabled');
  });
});

describe('экран taskList: completeSelected — Policy над выбранными', () => {
  test('ничего не выбрано — отключено с подсказкой', async () => {
    const { list } = await listOf([open(TASK_A)]);

    expect(answerOf(list.view(), 'completeSelected')).toEqual({
      kind: 'disabled',
      text: 'Отметьте открытые задачи',
    });
  });

  test('выбрана только выполненная — отключено с той же подсказкой', async () => {
    const { list } = await listOf([open(TASK_A), done(TASK_B)]);
    await select(list, TASK_B);

    expect(answerOf(list.view(), 'completeSelected')).toEqual({
      kind: 'disabled',
      text: 'Отметьте открытые задачи',
    });
  });

  test('выбрана своя открытая — доступно', async () => {
    const { list } = await listOf([open(TASK_A), done(TASK_B)]);
    await select(list, TASK_A);

    expect(answerOf(list.view(), 'completeSelected')).toEqual({
      kind: 'available',
    });
  });

  test('выбрана задача чужого владельца — скрыто', async () => {
    const { list } = await listOf([open(TASK_A, OTHER)]);
    await select(list, TASK_A);

    expect(answerOf(list.view(), 'completeSelected')).toEqual({
      kind: 'hidden',
    });
  });

  test('администратор — чужая задача доступна', async () => {
    const { list } = await listOf([open(TASK_A, OTHER)], { subject: admin });
    await select(list, TASK_A);

    expect(answerOf(list.view(), 'completeSelected')).toEqual({
      kind: 'available',
    });
  });

  test('субъекта нет — скрыто, пока выбрана открытая задача', async () => {
    const { list } = await listOf([open(TASK_A)], { subject: undefined });
    await select(list, TASK_A);

    expect(answerOf(list.view(), 'completeSelected')).toEqual({
      kind: 'hidden',
    });
  });

  test('субъекта нет и выбора нет — отключено: подсказка идёт раньше Policy', async () => {
    const { list } = await listOf([open(TASK_A)], { subject: undefined });

    expect(answerOf(list.view(), 'completeSelected').kind).toBe('disabled');
  });
});

describe('экран taskList: выделение и страницы', () => {
  test('toggle — локальное действие: сервер не зовётся, выбор в состоянии', async () => {
    const { kit, list } = await listOf([open(TASK_A), open(TASK_B)]);
    const before = kit.ucs.names();

    await select(list, TASK_A);

    expect(kit.ucs.names()).toEqual(before);
    expect(list.view().state).toEqual({ selected: [TASK_A] });
  });

  test('toggle и open доступны при задачах на странице, без задач — отключены', async () => {
    const some = await listOf([open(TASK_A)]);
    const none = await listOf([]);

    expect(answerOf(some.list.view(), 'toggle').kind).toBe('available');
    expect(answerOf(some.list.view(), 'open').kind).toBe('available');
    expect(answerOf(none.list.view(), 'toggle').kind).toBe('disabled');
    expect(answerOf(none.list.view(), 'open').kind).toBe('disabled');
  });

  test('next и prev решают данные: первая страница, вторая страница', async () => {
    const rows = [open(TASK_A), open(TASK_B), done(TASK_C)];
    const first = await listOf(rows);
    const second = await listOf(rows, {}, 1);

    expect(answerOf(first.list.view(), 'next').kind).toBe('available');
    expect(answerOf(first.list.view(), 'prev')).toEqual({
      kind: 'disabled',
      text: expect.stringMatching(/\S/),
    });
    expect(answerOf(second.list.view(), 'prev').kind).toBe('available');
    expect(answerOf(second.list.view(), 'next').kind).toBe('disabled');
  });
});

describe('экран taskList: jumpTo — переход к части списка по номеру', () => {
  const trace = requestTrace('r-go');
  const go = (
    list: Awaited<ReturnType<typeof listOf>>['list'],
    part: unknown,
  ) => list.act({ action: 'jumpTo', input: { part }, revision: 1, trace });
  const rows = [open(TASK_A), open(TASK_B), done(TASK_C), open(TASK_D)];

  test('действие доступно всегда, UC не вызывается', async () => {
    const { kit, list } = await listOf(rows);
    const before = kit.ucs.names();

    expect(answerOf(list.view(), 'jumpTo')).toEqual({ kind: 'available' });
    await go(list, 2);

    expect(kit.ucs.names()).toEqual(before);
  });

  test('номер 2 — переход на страницу с индексом 1 (at({ page: input.part - 1 }))', async () => {
    const { list } = await listOf(rows);

    expect(await go(list, 2)).toEqual({
      kind: 'moved',
      address: { screen: LIST_ID, params: { page: 1 } },
    });
  });

  test('номер 1 — адрес первой страницы', async () => {
    const { list } = await listOf(rows, {}, 1);

    expect(await go(list, 1)).toEqual({
      kind: 'moved',
      address: { screen: LIST_ID, params: { page: 0 } },
    });
  });

  test('дробный номер — rejected (поле целое)', async () => {
    const { list } = await listOf(rows);

    expect(await go(list, 1.5)).toMatchObject({
      kind: 'rejected',
      issues: [{ field: 'part' }],
    });
  });
});
