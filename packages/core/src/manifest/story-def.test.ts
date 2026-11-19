import { describe, expect, test } from 'bun:test';
import { TaskPolicy, TaskRules } from 'dmg-core/testing/example';
import {
  FinishTasksStoryDef,
  LIST_START,
  OWNER,
  PlanTasksStoryDef,
  StartWorkStoryDef,
  UserCardScreenDef,
} from '../../testing/example';
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
          after: { screen: 'taskList', params: LIST_START.params },
        },
        {
          name: 'closed',
          label: 'Список закрыт',
          description: 'Пользователь закрыл список, не добавив задачу.',
          exits: ['taskList.closed'],
          after: 'back',
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

describe('StoryDef: цель исхода', () => {
  const screen = UiScene.exiting('a');
  const outcomesOf = (to?: Parameters<typeof UiScene.outcome>[1]) =>
    UiScene.story('s', [screen], {
      outcomes: { done: UiScene.outcome(screen, to) },
    }).normalize().outcomes;

  test('по умолчанию исход возвращает назад: normalize несёт after — back', () => {
    expect(outcomesOf()).toMatchObject([{ name: 'done', after: 'back' }]);
  });

  test('цель home — во вход приложения: normalize несёт after — home', () => {
    expect(outcomesOf('home')).toMatchObject([{ after: 'home' }]);
  });

  test('цель-адрес — экран по имени и параметры адреса', () => {
    const to = UserCardScreenDef.at({ userId: OWNER });

    expect(outcomesOf(to)).toMatchObject([
      { after: { screen: 'userCard', params: { userId: OWNER } } },
    ]);
  });

  test('имена выходов исхода прежние: экран.выход, цель их не меняет', () => {
    expect(outcomesOf('home')).toMatchObject([{ exits: ['a.done'] }]);
    expect(outcomesOf(UserCardScreenDef.at({ userId: OWNER }))).toMatchObject([
      { exits: ['a.done'] },
    ]);
  });

  test('after в спеке — ссылка на адрес, а не копия', () => {
    const to = UserCardScreenDef.at({ userId: OWNER });
    const story = UiScene.story('s', [screen], {
      outcomes: { done: UiScene.outcome(screen, to) },
    });

    expect(story.outcomes.done?.after).toBe(to);
  });

  test('меню «Начать работу»: закрытие ведёт во вход приложения', () => {
    expect(StartWorkStoryDef.normalize().outcomes).toMatchObject([
      { name: 'closed', after: 'home' },
    ]);
  });
});

describe('StoryDef: подсказка', () => {
  const screen = UiScene.screen('a');

  test('hint сторис — свойство Def и поле normalize', () => {
    const story = UiScene.story('s', [screen], { hint: 'Подсказка сторис' });

    expect(story.hint).toBe('Подсказка сторис');
    expect(story.normalize().hint).toBe('Подсказка сторис');
  });

  test('без подсказки — свойство не задано, ключа hint в normalize нет', () => {
    const story = UiScene.story('s', [screen]);

    expect(story.hint).toBeUndefined();
    expect(story.normalize()).not.toHaveProperty('hint');
  });

  test('сторис «Начать работу» учебного набора несёт подсказку', () => {
    expect(StartWorkStoryDef.hint).toBeString();
    expect(StartWorkStoryDef.normalize().hint).toBe(StartWorkStoryDef.hint!);
  });
});
