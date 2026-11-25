import { describe, expect, test } from 'bun:test';
import { TaskListScreenDef, TodoUiModuleDef } from 'dmg-ui/example';
import { UiModuleDef } from './ui-module-def';

describe('UiModuleDef', () => {
  test('форма: экраны, сторис и уведомления — именами', () => {
    expect(TodoUiModuleDef.normalize()).toEqual({
      dmg: 'uiModule',
      name: 'todo',
      label: 'Задачи',
      description: 'Экраны, сторис и уведомления модуля задач.',
      visible: false,
      screens: ['taskList', 'taskCard', 'assignedTasks', 'mainMenu'],
      stories: ['planTasks', 'finishTasks', 'followAssigned', 'startWork'],
      notifications: ['taskAssigned', 'taskCompleted'],
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
