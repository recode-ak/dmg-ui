import { F } from 'dmg-core';
import {
  CompleteTasksUcDef,
  ListAssignedTasksUcDef,
  TaskEvents,
} from 'dmg-core/testing/example';
import { type AnyScreenDef, ScreenDef } from 'dmg-ui';
import * as v from 'valibot';
import { UserCardScreenDef } from '../users/user-card.screen';
import {
  ASSIGNER,
  exampleTask,
  OWNER,
  TASK_A,
  TASK_B,
  taskRow,
} from './example-tasks';

/**
 * Задачи, назначенные вызывающему: перечитывается по назначению и снятию
 * назначения на него. Перехода на карточку задачи нет: она читает список
 * владельца, исполнитель её не загрузит. Карточка исполнителя открывается
 * по субъекту контекста. Выбранные задачи выполняет тот, кому разрешает
 * Policy набора задач: владелец каждой или администратор.
 */
export const AssignedTasksScreenDef = ScreenDef.define({
  name: 'assignedTasks',
  label: 'Назначенные мне',
  description: 'Задачи других владельцев, назначенные вызывающему.',
  reads: [ListAssignedTasksUcDef],
  data: v.object({
    tasks: v.pipe(v.array(taskRow), v.description('Назначенные задачи')),
  }),
  state: v.strictObject({
    selected: v.pipe(
      v.array(F.uuid('выбранной задачи')),
      v.description('Выбранные задачи'),
    ),
  }),
  actions: {
    completeSelected: {
      label: 'Выполнить выбранные',
      description: 'Отмечает выбранные открытые поручения выполненными.',
      uc: CompleteTasksUcDef,
      confirm: {
        label: 'Выполнить выбранные поручения?',
        description: 'Выполненную задачу нельзя вернуть в работу.',
      },
    },
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
  locals: {
    toggle: {
      label: 'Отметить задачу',
      description: 'Добавляет поручение в выбор или убирает из него.',
      input: v.object({ taskId: F.uuid('задачи') }),
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
          exampleTask(TASK_A, 'Хлеб', 'open', {
            ownerId: ASSIGNER,
            assigneeId: OWNER,
          }),
          exampleTask(TASK_B, 'Молоко', 'done', {
            ownerId: ASSIGNER,
            assigneeId: OWNER,
          }),
        ],
      },
      state: { selected: [] },
    },
  },
});
