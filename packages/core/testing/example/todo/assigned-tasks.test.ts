import { describe, expect, test } from 'bun:test';
import { ok } from 'dmg-core';
import { testUuid } from 'dmg-core/testing';
import {
  CompleteTasksUcDef,
  ListAssignedTasksUcDef,
} from 'dmg-core/testing/example';
import type { InstanceView } from 'dmg-ui';
import { type TaskStateRow, taskState } from '../../task-state';
import { RuntimeKit, requestTrace } from '../../ui-runtime-fixture';
import { AssignedTasksScreenDef } from './assigned-tasks.screen';
import { TASK_A } from './example-tasks';

// «Назначенные мне»: карточка исполнителя открывается по субъекту, а не по
// назначению строки; выбранные задачи выполняет тот, кому разрешает Policy:
// владелец задачи или администратор, исполнитель-не-владелец — нет.

const ME = testUuid(7);
const ADMIN = testUuid(3);
const AT = Date.UTC(2026, 0, 1);
const me = { uuid: ME, hasRole: () => false };
const admin = { uuid: ADMIN, hasRole: (role: string) => role === 'admin' };
const trace = requestTrace('r-assigned');

/** Поручение: задача другого владельца, назначенная на `assigneeId`. */
const assigned = (assigneeId = ME): TaskStateRow =>
  taskState({
    uuid: TASK_A,
    title: 'Хлеб',
    status: 'open',
    assignment: { assigneeId, assignedAt: AT },
  });

/** Экран с ответом `listAssignedTasks` из `rows`; контекст по умолчанию — исполнитель `me`. */
const open = async (
  rows: readonly TaskStateRow[],
  context: Parameters<RuntimeKit['openList']>[0] = { subject: me },
) => {
  const kit = new RuntimeKit();
  kit.ucs.answer(ListAssignedTasksUcDef, ok([...rows]));
  kit.ucs.answer(CompleteTasksUcDef, ok({}));
  const instance = await kit.runtime.open(
    AssignedTasksScreenDef.at({}),
    RuntimeKit.options(context),
  );
  return { kit, instance };
};

/** Ответ о действии из вида: скрытого в виде нет. */
const answerOf = (view: InstanceView, name: string) =>
  [...view.actions, ...view.locals].find((item) => item.name === name)
    ?.availability ?? { kind: 'hidden' };

const select = (instance: Awaited<ReturnType<typeof open>>['instance']) =>
  instance.local({ name: 'toggle', input: { taskId: TASK_A } });

describe('экран assignedTasks: openAssignee', () => {
  test('с поручениями данные — строки state без исполнителя, действие доступно', async () => {
    const { instance } = await open([assigned()]);

    const view = instance.view();

    expect(view.data).toEqual({ tasks: [assigned()] });
    expect(answerOf(view, 'openAssignee')).toEqual({ kind: 'available' });
  });

  test('без поручений — отключено с текстом, нажатие — unavailable', async () => {
    const { instance } = await open([]);

    expect(instance.view().data).toEqual({ tasks: [] });
    expect(answerOf(instance.view(), 'openAssignee')).toEqual({
      kind: 'disabled',
      text: 'Поручений нет',
    });
    expect(
      await instance.act({ action: 'openAssignee', revision: 1, trace }),
    ).toEqual({ kind: 'unavailable', reason: 'disabled' });
  });

  test('переход несёт userId субъекта, а не исполнителя из назначения строки', async () => {
    const { instance } = await open([assigned(testUuid(9))]);

    const outcome = await instance.act({
      action: 'openAssignee',
      revision: 1,
      trace,
    });

    expect(outcome).toEqual({
      kind: 'moved',
      address: { screen: 'exampleUi/users/userCard', params: { userId: ME } },
    });
  });
});

describe('экран assignedTasks: openAssignee без субъекта', () => {
  test('субъекта нет — «Карточка исполнителя» скрыта, нажатие — unavailable без дефекта', async () => {
    const { kit, instance } = await open([assigned()], { subject: undefined });

    expect(answerOf(instance.view(), 'openAssignee')).toEqual({
      kind: 'hidden',
    });
    expect(
      await instance.act({ action: 'openAssignee', revision: 1, trace }),
    ).toEqual({ kind: 'unavailable', reason: 'disabled' });
    expect(kit.faults).toEqual([]);
    expect(kit.observer.kinds()).not.toContain('defect');
  });
});

describe('экран assignedTasks: выделение и выполнение выбранных', () => {
  test('toggle — локальное действие: сервер не зовётся, выбор в состоянии', async () => {
    const { kit, instance } = await open([assigned()]);
    const before = kit.ucs.names();

    await select(instance);

    expect(kit.ucs.names()).toEqual(before);
    expect(instance.view().state).toEqual({ selected: [TASK_A] });
  });

  test('исполнитель-не-владелец выбрал поручение — «Выполнить выбранные» скрыто', async () => {
    const { instance } = await open([assigned()]);
    await select(instance);

    expect(answerOf(instance.view(), 'completeSelected')).toEqual({
      kind: 'hidden',
    });
  });

  test('администратор выбрал поручение — «Выполнить выбранные» доступно', async () => {
    const { instance } = await open([assigned(ADMIN)], { subject: admin });
    await select(instance);

    expect(answerOf(instance.view(), 'completeSelected')).toEqual({
      kind: 'available',
    });
  });

  test('субъекта нет — «Выполнить выбранные» скрыто', async () => {
    const { instance } = await open([assigned()], { subject: undefined });
    await select(instance);

    expect(answerOf(instance.view(), 'completeSelected')).toEqual({
      kind: 'hidden',
    });
  });

  test('администратор выполняет выбранное: UC получает id выбранных задач', async () => {
    const { kit, instance } = await open([assigned(ADMIN)], { subject: admin });
    await select(instance);

    const outcome = await instance.act({
      action: 'completeSelected',
      revision: 1,
      confirmed: true,
      trace,
    });

    expect(outcome).toMatchObject({ kind: 'stayed' });
    expect(kit.ucs.calls).toContainEqual(
      expect.objectContaining({
        uc: 'completeTasks',
        input: { taskIds: [TASK_A] },
      }),
    );
  });

  test('нажатие скрытого «Выполнить выбранные» исполнителем — unavailable, UC не вызван', async () => {
    const { kit, instance } = await open([assigned()]);
    await select(instance);

    const outcome = await instance.act({
      action: 'completeSelected',
      revision: 1,
      confirmed: true,
      trace,
    });

    expect(outcome).toEqual({ kind: 'unavailable', reason: 'disabled' });
    expect(kit.ucs.names()).not.toContain('completeTasks');
  });
});
