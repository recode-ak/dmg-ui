import { F } from 'dmg-core';
import {
  AssignTaskUcDef,
  CompleteTaskUcDef,
  ListTasksUcDef,
  TaskEvents,
} from 'dmg-core/testing/example';
import { type AnyScreenDef, fieldHint, ScreenDef } from 'dmg-ui';
import * as v from 'valibot';
import { exampleTask, TASK_A, TASK_B, taskRow } from './example-tasks';
import { TaskListScreenDef } from './task-list.screen';

/**
 * Карточка задачи владельца: выполнение (по Policy задачи; у выполненной —
 * отключено), назначение исполнителя — текстовый вход, напоминание (булево и дата, без UC),
 * возврат к списку.
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
    remind: {
      label: 'Напомнить',
      description: 'Напоминание о задаче.',
      input: v.object({
        urgent: v.pipe(
          v.boolean(),
          v.title('Срочно'),
          fieldHint('Срочное напоминание придёт сразу'),
          v.description('Срочное напоминание придёт сразу'),
        ),
        remindOn: v.pipe(
          v.string(),
          v.isoDate('Дата в виде ГГГГ-ММ-ДД'),
          v.title('Когда'),
          fieldHint('День напоминания'),
          v.examples(['2026-12-31']),
          v.description('День напоминания'),
        ),
      }),
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
      data: exampleTask(TASK_A, 'Хлеб', 'open'),
    },
    done: {
      label: 'Выполненная задача',
      description: 'Выполнить уже нельзя.',
      params: { taskId: TASK_B },
      data: exampleTask(TASK_B, 'Молоко', 'done'),
    },
  },
});
