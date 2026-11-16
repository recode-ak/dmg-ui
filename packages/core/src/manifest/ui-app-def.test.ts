import { describe, expect, test } from 'bun:test';
import { ExampleUiAppDef } from '../../testing/ui-fixture';

describe('UiAppDef', () => {
  test('форма: набор, канал, сторис, уведомления и входы с адресом', () => {
    expect(ExampleUiAppDef.normalize()).toEqual({
      dmg: 'uiApp',
      name: 'exampleConsole',
      label: 'Учебное приложение в консоли',
      description: 'Приложение UI для текстового канала.',
      visible: false,
      set: 'exampleUi',
      channel: 'dmg-ui-console',
      stories: ['planTasks', 'finishTasks'],
      notifications: ['taskAssigned'],
      entries: [
        {
          name: 'start',
          label: 'Начало',
          description: 'Список задач с начала.',
          screen: 'taskList',
          params: { index: 0 },
        },
      ],
    });
  });
});
