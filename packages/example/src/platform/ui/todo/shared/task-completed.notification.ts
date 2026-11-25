import {
  GetTaskAssigneeUcDef,
  ListAssignedTasksUcDef,
  TaskEvents,
} from 'dmg-core/testing/example';
import { NotificationDef } from 'dmg-ui';
import * as v from 'valibot';
import { AssignedTasksScreenDef } from '../follow-assigned/assigned-tasks.screen';

/**
 * Исполнитель узнаёт, что поручение выполнено. В payload события
 * исполнителя нет: получателя находит системный query UC (`from: 'query'`).
 */
export const TaskCompletedNotificationDef = NotificationDef.define({
  name: 'taskCompleted',
  label: 'Поручение выполнено',
  description: 'Исполнитель узнаёт, что назначенная ему задача выполнена.',
  event: TaskEvents.completed,
  recipients: {
    from: 'query',
    uc: GetTaskAssigneeUcDef,
    input: { taskId: 'taskId' },
    fields: ['assigneeId'],
  },
  reads: [ListAssignedTasksUcDef],
  data: v.object({
    title: v.pipe(v.string(), v.description('Название задачи')),
  }),
  links: () => [AssignedTasksScreenDef],
  examples: {
    sample: {
      label: 'Выполнение',
      description: 'Выполнена задача «Сыр».',
      data: { title: 'Сыр' },
    },
  },
});
