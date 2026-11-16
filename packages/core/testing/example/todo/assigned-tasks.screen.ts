import { ListAssignedTasksUcDef, TaskEvents } from 'dmg-core/testing/example';
import { ScreenDef } from 'dmg-ui';
import * as v from 'valibot';
import { TASK_A, TASK_B, taskRow } from './example-tasks';

/**
 * Задачи, назначенные вызывающему: перечитывается по назначению и снятию
 * назначения на него. Переходов на карточку нет: карточка читает список
 * владельца, исполнитель её не загрузит.
 */
export const AssignedTasksScreenDef = ScreenDef.define({
  name: 'assignedTasks',
  label: 'Назначенные мне',
  description: 'Задачи других владельцев, назначенные вызывающему.',
  reads: [ListAssignedTasksUcDef],
  data: v.object({
    tasks: v.pipe(v.array(taskRow), v.description('Назначенные задачи')),
  }),
  actions: {
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
      },
    },
  },
});
