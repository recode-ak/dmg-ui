import { describe, expect, test } from 'bun:test';
import { LIST_START } from '../../testing/example';
import { ExampleStubUiAppDef } from '../../testing/ui-app.fixture';

describe('UiAppDef', () => {
  test('форма: набор, канал, сторис, уведомления и входы с адресом', () => {
    expect(ExampleStubUiAppDef.normalize()).toEqual({
      dmg: 'uiApp',
      name: 'exampleStub',
      label: 'Учебное приложение в подставном канале',
      description: 'Приложение UI учебного примера для тестов ядра.',
      visible: false,
      set: 'exampleUi',
      channel: 'dmg-ui-stub',
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
