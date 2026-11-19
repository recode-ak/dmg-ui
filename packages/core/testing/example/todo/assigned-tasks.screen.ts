import { F } from 'dmg-core';
import { ListAssignedTasksUcDef, TaskEvents } from 'dmg-core/testing/example';
import { type AnyScreenDef, ScreenDef } from 'dmg-ui';
import * as v from 'valibot';
import { UserCardScreenDef } from '../users/user-card.screen';
import { ASSIGNEE, TASK_A, TASK_B, taskRow } from './example-tasks';

/**
 * Задачи, назначенные вызывающему: перечитывается по назначению и снятию
 * назначения на него. Перехода на карточку задачи нет: она читает список
 * владельца, исполнитель её не загрузит. Карточка исполнителя открывается по
 * `assigneeId` из назначения первой строки — мост, пока субъекта нет в
 * контексте экрана (DEBT-UI-50).
 */
export const AssignedTasksScreenDef = ScreenDef.define({
  name: 'assignedTasks',
  label: 'Назначенные мне',
  description: 'Задачи других владельцев, назначенные вызывающему.',
  reads: [ListAssignedTasksUcDef],
  data: v.object({
    tasks: v.pipe(v.array(taskRow), v.description('Назначенные задачи')),
    assigneeId: v.optional(F.uuid('исполнителя поручений')),
  }),
  actions: {
    openAssignee: {
      label: 'Карточка исполнителя',
      description: 'Открыть карточку пользователя, которому поручены задачи.',
      to: (): readonly AnyScreenDef[] => [UserCardScreenDef],
    },
    close: {
      label: 'Закрыть',
      description: 'Закончить просмотр поручений.',
    },
  },
  exits: {
    closed: {
      label: 'Поручения просмотрены',
      description: 'Пользователь закрыл список поручений.',
    },
  },
  refresh: [
    { event: TaskEvents.assigned, subject: 'assigneeId' },
    { event: TaskEvents.unassigned, subject: 'assigneeId' },
  ],
  examples: {
    two: {
      label: 'Два поручения',
      description: 'Две задачи другого владельца назначены вызывающему.',
      params: {},
      data: {
        tasks: [
          { uuid: TASK_A, title: 'Хлеб', status: 'open' },
          { uuid: TASK_B, title: 'Молоко', status: 'done' },
        ],
        assigneeId: ASSIGNEE,
      },
    },
  },
});
