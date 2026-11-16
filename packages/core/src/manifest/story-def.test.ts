import { describe, expect, test } from 'bun:test';
import {
  FinishTasksStoryDef,
  PlanTasksStoryDef,
} from '../../testing/ui-fixture';

describe('StoryDef', () => {
  test('форма: вызывающие, цель, старт, экраны и исходы с выходами', () => {
    expect(PlanTasksStoryDef.normalize()).toEqual({
      dmg: 'story',
      name: 'planTasks',
      label: 'Планирование задач',
      description: 'Пользователь добавляет задачи в список.',
      visible: false,
      callers: ['user'],
      goal: 'чтобы не забыть дела',
      start: 'taskList',
      screens: ['taskList'],
      outcomes: [
        {
          name: 'created',
          label: 'Задача добавлена',
          description: 'В списке появилась новая задача.',
          exits: ['taskList.created'],
        },
      ],
    });
  });

  test('общий экран двух сторис — один Def, в обеих под своим именем', () => {
    expect(FinishTasksStoryDef.screens[0]).toBe(PlanTasksStoryDef.screens[0]!);
    expect(FinishTasksStoryDef.normalize().screens).toEqual([
      'taskList',
      'taskCard',
    ]);
  });
});
