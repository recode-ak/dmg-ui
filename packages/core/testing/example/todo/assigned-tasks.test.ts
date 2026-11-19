import { describe, expect, test } from 'bun:test';
import { type OutputOf, ok } from 'dmg-core';
import { testUuid } from 'dmg-core/testing';
import { ListAssignedTasksUcDef } from 'dmg-core/testing/example';
import { RuntimeKit, requestTrace } from '../../ui-runtime-fixture';
import { AssignedTasksScreenDef } from './assigned-tasks.screen';
import { OWNER, TASK_A } from './example-tasks';

// «Назначенные мне»: переход на карточку исполнителя. Исполнитель — из
// назначения первой строки; поручений нет — перехода нет.

type AssignedRow = OutputOf<typeof ListAssignedTasksUcDef>[number];

const ME = testUuid(7);
const AT = Date.UTC(2026, 0, 1);
const ASSIGNED_ROW: AssignedRow = {
  uuid: TASK_A,
  createdAt: AT,
  updatedAt: AT,
  version: 1,
  ownerId: OWNER,
  title: 'Хлеб',
  status: 'open',
  assignment: { assigneeId: ME, assignedAt: AT },
};
const trace = requestTrace('r-assigned');

const open = (rows: readonly AssignedRow[]) => {
  const kit = new RuntimeKit();
  kit.ucs.answer(ListAssignedTasksUcDef, ok([...rows]));
  return kit.runtime.open(AssignedTasksScreenDef.at({}), RuntimeKit.options());
};

describe('экран assignedTasks: openAssignee', () => {
  test('с поручениями данные несут исполнителя, действие доступно', async () => {
    const view = (await open([ASSIGNED_ROW])).view();

    expect(view.data).toMatchObject({ assigneeId: ME });
    expect(view.actions.find((a) => a.name === 'openAssignee')).toMatchObject({
      available: true,
    });
  });

  test('без поручений исполнителя в данных нет, действие недоступно', async () => {
    const instance = await open([]);

    expect(instance.view().data).toEqual({ tasks: [] });
    expect(
      instance.view().actions.find((a) => a.name === 'openAssignee'),
    ).toMatchObject({ available: false });
    expect(
      await instance.act({ action: 'openAssignee', revision: 1, trace }),
    ).toEqual({ kind: 'unavailable', reason: 'disabled' });
  });

  test('переход несёт userId исполнителя в параметрах карточки', async () => {
    const instance = await open([ASSIGNED_ROW]);

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
