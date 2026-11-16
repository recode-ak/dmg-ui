import { describe, expect, test } from 'bun:test';
import { LIST_START } from '../../testing/example';
import { ExampleDialogAppDef } from '../../testing/example/dialog/example-dialog.app';

describe('UiAppDef', () => {
  test('форма: набор, канал, сторис, уведомления и входы с адресом', () => {
    expect(ExampleDialogAppDef.normalize()).toEqual({
      dmg: 'uiApp',
      name: 'exampleDialog',
      label: 'Учебное приложение в диалоге',
      description: 'Приложение UI учебного примера для диалогового канала.',
      visible: false,
      set: 'exampleUi',
      channel: 'dmg-ui-dialog',
      stories: ['planTasks', 'finishTasks', 'followAssigned'],
      notifications: ['taskAssigned', 'taskCompleted'],
      entries: [
        {
          name: 'start',
          label: 'Мои задачи',
          description: 'Список своих задач с начала.',
          screen: 'taskList',
          params: LIST_START.params,
        },
        {
          name: 'assigned',
          label: 'Назначенные мне',
          description: 'Задачи, которые поручили вызывающему.',
          screen: 'assignedTasks',
          params: {},
        },
      ],
    });
  });
});
