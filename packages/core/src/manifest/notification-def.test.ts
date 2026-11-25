import { describe, expect, test } from 'bun:test';
import { toJsonSchema } from 'dmg-core';
import {
  TaskAssignedNotificationDef,
  TaskCompletedNotificationDef,
} from 'dmg-ui/example';

describe('NotificationDef', () => {
  test('форма: событие, получатели, чтения, данные, ссылки и примеры', () => {
    expect(TaskAssignedNotificationDef.normalize()).toEqual({
      dmg: 'notification',
      name: 'taskAssigned',
      label: 'Вам назначена задача',
      description: 'Исполнитель узнаёт о назначенной ему задаче.',
      visible: false,
      event: 'todo.task.assigned',
      recipients: { from: 'payload', fields: ['assigneeId'] },
      reads: ['listAssignedTasks'],
      data: toJsonSchema(TaskAssignedNotificationDef.data),
      links: ['assignedTasks'],
      examples: ['sample'],
    });
  });

  test('получатели из query — UC, вход и поля в форме', () => {
    expect(TaskCompletedNotificationDef.normalize().recipients).toEqual({
      from: 'query',
      uc: 'getTaskAssignee',
      input: { taskId: 'taskId' },
      fields: ['assigneeId'],
    });
  });
});
