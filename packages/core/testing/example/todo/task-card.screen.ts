import { F } from 'dmg-core';
import {
  AssignTaskUcDef,
  CompleteTaskUcDef,
  ListTasksUcDef,
  TaskEvents,
} from 'dmg-core/testing/example';
import { type AnyScreenDef, ScreenDef } from 'dmg-ui';
import * as v from 'valibot';
import { TASK_A, TASK_B, taskRow } from './example-tasks';
import { TaskListScreenDef } from './task-list.screen';

/**
 * Карточка задачи владельца: выполнение (недоступно по данным у
 * выполненной), назначение исполнителя — текстовый вход, возврат к списку.
 */
export const TaskCardScreenDef = ScreenDef.define({
  name: 'taskCard',
  label: 'Задача',
  description: 'Карточка одной задачи.',
  params: v.strictObject({ taskId: F.uuid('задачи') }),
  reads: [ListTasksUcDef],
  data: taskRow,
  actions: {
    back: {
      label: 'К списку',
      description: 'Возврат к списку задач.',
      to: (): readonly AnyScreenDef[] => [TaskListScreenDef],
    },
    complete: {
      label: 'Выполнить',
      description: 'Отмечает задачу выполненной.',
      uc: CompleteTaskUcDef,
    },
    assign: {
      label: 'Назначить',
      description: 'Назначает исполнителя задачи.',
      input: v.object({ assigneeId: F.uuid('исполнителя') }),
      uc: AssignTaskUcDef,
    },
  },
  refresh: [
    {
      event: TaskEvents.completed,
      params: { taskId: 'taskId' },
      subject: 'ownerId',
    },
  ],
  examples: {
    open: {
      label: 'Открытая задача',
      description: 'Задачу можно выполнить.',
      params: { taskId: TASK_A },
      data: { uuid: TASK_A, title: 'Хлеб', status: 'open' },
    },
    done: {
      label: 'Выполненная задача',
      description: 'Выполнить уже нельзя.',
      params: { taskId: TASK_B },
      data: { uuid: TASK_B, title: 'Молоко', status: 'done' },
    },
  },
});
