import { describe, expect, test } from 'bun:test';
import {
  ExampleUiSetDef,
  FinishTasksStoryDef,
  FollowAssignedStoryDef,
  MainMenuScreenDef,
  OWNER,
  PlanTasksStoryDef,
  StartWorkStoryDef,
  TaskListScreenDef,
  UserCardScreenDef,
  ViewUserStoryDef,
} from 'dmg-ui/example';
import { UiScene } from '../../testing/ui-arch';
import { ExitTargets } from './exit-targets';
import { UiAppDef } from './ui-app-def';

// Цель выхода экрана решает ядро по сторис приложения. Нет приложения,
// сторис или исхода с этим выходом — «назад».

const a = UiScene.exiting('a');
const to = UserCardScreenDef.at({ userId: OWNER });
const targetOf = (stories: readonly ReturnType<typeof UiScene.story>[]) =>
  ExitTargets.of(new UiScene({ screens: [a], stories }).app).of(a, 'done');

describe('ExitTargets', () => {
  test('нет приложения — назад', () => {
    expect(ExitTargets.of(undefined).of(a, 'done')).toEqual({ kind: 'back' });
  });

  test('в приложении нет сторис с этим выходом — назад', () => {
    expect(targetOf([])).toEqual({ kind: 'back' });
  });

  test('исход без цели — назад', () => {
    const story = UiScene.story('s', [a], {
      outcomes: { done: UiScene.outcome(a) },
    });

    expect(targetOf([story])).toEqual({ kind: 'back' });
  });

  test('цель home — во вход приложения', () => {
    const story = UiScene.story('s', [a], {
      outcomes: { done: UiScene.outcome(a, 'home') },
    });

    expect(targetOf([story])).toEqual({ kind: 'home' });
  });

  test('цель-адрес — свой экран с параметрами', () => {
    const story = UiScene.story('s', [a], {
      outcomes: { done: UiScene.outcome(a, to) },
    });

    expect(targetOf([story])).toEqual({ kind: 'at', address: to });
  });

  test('выход, которого нет ни в одном исходе, — назад', () => {
    const story = UiScene.story('s', [a], {
      outcomes: { done: UiScene.outcome(a, 'home') },
    });
    const scene = new UiScene({ screens: [a], stories: [story] });

    expect(ExitTargets.of(scene.app).of(a, 'other')).toEqual({ kind: 'back' });
  });

  test('сторис вне приложения не считается: цель — назад', () => {
    const outside = UiScene.story('outside', [a], {
      outcomes: { done: UiScene.outcome(a, 'home') },
    });
    const inside = UiScene.story('inside', [UiScene.screen('b')]);
    const scene = new UiScene({
      screens: [a, ...inside.screens],
      stories: [outside, inside],
      appStories: [inside],
    });

    expect(ExitTargets.of(scene.app).of(a, 'done')).toEqual({ kind: 'back' });
  });

  test('выход привязан к исходам двух сторис с одной целью — эта цель', () => {
    const story = (name: string) =>
      UiScene.story(name, [a], {
        outcomes: {
          done: UiScene.outcome(a, UserCardScreenDef.at({ userId: OWNER })),
        },
      });

    expect(targetOf([story('s1'), story('s2')])).toEqual({
      kind: 'at',
      address: to,
    });
  });
});

describe('ExitTargets: учебный набор', () => {
  const app = UiAppDef.define({
    name: 'exampleExits',
    label: 'Приложение целей исходов',
    description: 'Все сторис учебного набора для проверки целей исходов.',
    set: ExampleUiSetDef,
    channel: 'mini-channel',
    stories: [
      StartWorkStoryDef,
      PlanTasksStoryDef,
      FinishTasksStoryDef,
      FollowAssignedStoryDef,
      ViewUserStoryDef,
    ],
    entries: {
      menu: {
        label: 'Начать работу',
        description: 'Меню.',
        address: MainMenuScreenDef.at({}),
      },
    },
  });
  const targets = ExitTargets.of(app);

  test('закрытие меню — во вход приложения', () => {
    expect(targets.of(MainMenuScreenDef, 'closed')).toEqual({ kind: 'home' });
  });

  test('создание задачи в обеих сторис — адрес списка, заданный в сторис', () => {
    const target = targets.of(TaskListScreenDef, 'created');

    expect(target.kind).toBe('at');
    expect(target).toHaveProperty(
      'address',
      PlanTasksStoryDef.outcomes.created?.after,
    );
  });

  test('find: экран по id из внешних данных — цель его выхода', () => {
    expect(targets.find('exampleUi/todo/mainMenu', 'closed')).toEqual({
      kind: 'home',
    });
  });

  test('find: экрана нет в наборе — назад, без броска', () => {
    expect(targets.find('exampleUi/todo/ghost', 'closed')).toEqual({
      kind: 'back',
    });
    expect(
      ExitTargets.of(undefined).find('exampleUi/todo/mainMenu', 'closed'),
    ).toEqual({
      kind: 'back',
    });
  });

  test('закрытие списка и карточки пользователя — назад', () => {
    expect(targets.of(TaskListScreenDef, 'closed')).toEqual({ kind: 'back' });
    expect(targets.of(UserCardScreenDef, 'closed')).toEqual({ kind: 'back' });
  });
});
