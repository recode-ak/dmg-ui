import { describe, expect, test } from 'bun:test';
import { toJsonSchema } from 'dmg-core';
import { TaskAssignedNotificationDef } from '../../testing/ui-fixture';

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
      reads: ['listTasks'],
      data: toJsonSchema(TaskAssignedNotificationDef.data),
      links: ['taskCard'],
      examples: ['sample'],
    });
  });
});
