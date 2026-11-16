import { describe, expect, test } from 'bun:test';
import { UiScene } from '../../../testing/ui-arch';

const b = UiScene.screen('b');
const a = UiScene.screen('a', { actions: { go: UiScene.jump(b) } });

describe('UI-03: переход ведёт на экран с общей сторис', () => {
  test('нарушение: у экрана и цели перехода нет общей сторис', () => {
    const scene = new UiScene({
      screens: [a, b],
      stories: [UiScene.story('s1', [a]), UiScene.story('s2', [b])],
      entries: { start: UiScene.entry(b) },
    });

    const report = scene.report();

    expect(report.code).toBe(1);
    expect(report.rule('UI-03')).toEqual([
      'UI-03: действие miniUi/todo/a/go ведёт на экран miniUi/todo/b, с которым у экрана нет общей сторис',
    ]);
  });

  test('без нарушения: экран — вход приложения, меню ведёт в чужую сторис', () => {
    const scene = new UiScene({
      screens: [a, b],
      stories: [UiScene.story('s1', [a]), UiScene.story('s2', [b])],
    });

    expect(scene.report().rule('UI-03')).toEqual([]);
  });

  test('без нарушения: у экрана и цели есть общая сторис', () => {
    const scene = new UiScene({
      screens: [a, b],
      stories: [UiScene.story('s1', [a, b])],
      entries: { start: UiScene.entry(b) },
    });

    expect(scene.report().rule('UI-03')).toEqual([]);
  });
});
