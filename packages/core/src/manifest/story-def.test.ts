import { describe, expect, test } from 'bun:test';
import { TaskPolicy, TaskRules } from 'dmg-core/testing/example';
import { FinishTasksStoryDef, PlanTasksStoryDef } from '../../testing/example';
import { UiScene } from '../../testing/ui-arch';
import type { StoryDef } from './story-def';

describe('StoryDef', () => {
  test('форма: вызывающие, цель, старт, экраны, исходы с выходами, связи и правила', () => {
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
        {
          name: 'closed',
          label: 'Список закрыт',
          description: 'Пользователь закрыл список, не добавив задачу.',
          exits: ['taskList.closed'],
        },
      ],
      leads: [],
      rules: ['withinOpenLimit'],
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

describe('StoryDef: связи, доступ и правила', () => {
  const screen = UiScene.screen('a');
  const target = UiScene.story('target', [UiScene.screen('t')]);

  test('по умолчанию связей, доступа и правил нет', () => {
    const story = UiScene.story('s', [screen]);

    expect(story.leads()).toEqual([]);
    expect(story.access).toBeUndefined();
    expect(story.rules).toEqual([]);
  });

  test('связи раскрываются отложенно: цикл «A ведёт в B, B в A» допустим', () => {
    const first: StoryDef = UiScene.story('first', [screen], {
      leads: () => [second],
    });
    const second: StoryDef = UiScene.story('second', [screen], {
      leads: () => [first],
    });

    expect(first.leads()).toEqual([second]);
    expect(second.leads()[0]).toBe(first);
  });

  test('normalize: связи и правила — именами, доступ — свёрнутым правилом', () => {
    const story = UiScene.story('s', [screen], {
      leads: () => [target],
      access: TaskPolicy.rules.canManage,
      rules: [TaskRules.rules.withinOpenLimit],
    });

    expect(story.normalize()).toMatchObject({
      leads: ['target'],
      rules: ['withinOpenLimit'],
      access: TaskPolicy.rules.canManage.normalize(),
    });
  });

  test('normalize без связей и доступа: leads и rules пусты, access нет', () => {
    const normalized = UiScene.story('s', [screen]).normalize();

    expect(normalized).toMatchObject({ leads: [], rules: [] });
    expect(normalized.access).toBeUndefined();
  });

  test('access и rules — ссылки на объекты домена, а не копии', () => {
    const story = UiScene.story('s', [screen], {
      access: TaskPolicy.rules.canManage,
      rules: [TaskRules.rules.withinOpenLimit],
    });

    expect(story.access).toBe(TaskPolicy.rules.canManage);
    expect(story.rules[0]).toBe(TaskRules.rules.withinOpenLimit);
  });
});
