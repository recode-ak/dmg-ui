import { ListAssignedTasksUcDef, TaskEvents } from 'dmg-core/testing/example';
import { NotificationDef } from 'dmg-ui';
import * as v from 'valibot';
import { AssignedTasksScreenDef } from './assigned-tasks.screen';

/** Исполнитель узнаёт о назначении: получатель — из payload события. */
export const TaskAssignedNotificationDef = NotificationDef.define({
  name: 'taskAssigned',
  label: 'Вам назначена задача',
  description: 'Исполнитель узнаёт о назначенной ему задаче.',
  event: TaskEvents.assigned,
  recipients: { from: 'payload', fields: ['assigneeId'] },
  reads: [ListAssignedTasksUcDef],
  data: v.object({
    title: v.pipe(v.string(), v.description('Название задачи')),
  }),
  links: () => [AssignedTasksScreenDef],
  examples: {
    sample: {
      label: 'Назначение',
      description: 'Назначена задача «Хлеб».',
      data: { title: 'Хлеб' },
    },
  },
});
