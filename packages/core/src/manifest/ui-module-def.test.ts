import { describe, expect, test } from 'bun:test';
import { TaskListScreenDef, TodoUiModuleDef } from '../../testing/ui-fixture';
import { UiModuleDef } from './ui-module-def';

describe('UiModuleDef', () => {
  test('форма: экраны, сторис и уведомления — именами', () => {
    expect(TodoUiModuleDef.normalize()).toEqual({
      dmg: 'uiModule',
      name: 'todo',
      label: 'Задачи',
      description: 'Экраны и сторис модуля задач.',
      visible: false,
      screens: ['taskList', 'taskCard'],
      stories: ['planTasks', 'finishTasks'],
      notifications: ['taskAssigned'],
    });
  });

  test('без уведомлений — пустой список', () => {
    const def = UiModuleDef.define({
      name: 'bare',
      label: 'Без уведомлений',
      description: 'Модуль из одного экрана.',
      screens: [TaskListScreenDef],
      stories: [],
    });

    expect(def.notifications).toEqual([]);
    expect(def.normalize().notifications).toEqual([]);
  });
});
