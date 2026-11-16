import { describe, expect, test } from 'bun:test';
import { CreateTaskUcDef, GetTaskUcDef } from 'dmg-core/testing/example';
import { UiScene } from '../../../testing/ui-arch';

const lines = (callers: ['user'] | ['system'], uc: 'read' | 'call') => {
  const screen = UiScene.screen('a', {
    reads: uc === 'read' ? [GetTaskUcDef] : [],
    actions: uc === 'call' ? { go: UiScene.call(CreateTaskUcDef) } : {},
  });
  const story = UiScene.story('s', [screen], { callers });
  return new UiScene({ screens: [screen], stories: [story] }).report();
};

describe('UI-01: вызывающие сторис допущены к UC её экранов', () => {
  test('нарушение: user не допущен к UC загрузки, открытому только system', () => {
    const report = lines(['user'], 'read');

    expect(report.code).toBe(1);
    expect(report.rule('UI-01')).toEqual([
      'UI-01: сторис miniUi/todo/s: вызывающий «user» не допущен к UC example/todo/getTask экрана miniUi/todo/a',
    ]);
  });

  test('нарушение: system не допущен к UC действия, открытому только user', () => {
    expect(lines(['system'], 'call').rule('UI-01')).toEqual([
      'UI-01: сторис miniUi/todo/s: вызывающий «system» не допущен к UC example/todo/createTask экрана miniUi/todo/a',
    ]);
  });

  test('без нарушения: system допущен к UC загрузки', () => {
    expect(lines(['system'], 'read').rule('UI-01')).toEqual([]);
  });

  test('без нарушения: user допущен к UC действия', () => {
    expect(lines(['user'], 'call').rule('UI-01')).toEqual([]);
  });
});
