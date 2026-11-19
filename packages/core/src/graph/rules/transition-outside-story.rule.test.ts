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
      'UI-03: действие miniUi/todo/a/go ведёт на экран miniUi/todo/b, с которым у экрана нет общей сторис и который не старт сторис из связей сторис',
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

  test('без нарушения: цель — старт сторис из связей сторис источника', () => {
    const t = UiScene.story('t', [b]);
    const scene = new UiScene({
      screens: [a, b],
      stories: [UiScene.story('s1', [a], { leads: () => [t] }), t],
      entries: { start: UiScene.entry(b) },
    });

    expect(scene.report().rule('UI-03')).toEqual([]);
  });

  test('нарушение: цель — не старт сторис из связей источника', () => {
    const c = UiScene.screen('c');
    const t = UiScene.story('t', [b, c], { start: b });
    const toC = UiScene.screen('toC', { actions: { go: UiScene.jump(c) } });
    const scene = new UiScene({
      screens: [toC, b, c],
      stories: [UiScene.story('s1', [toC], { leads: () => [t] }), t],
      entries: { start: UiScene.entry(b) },
    });

    expect(scene.report().rule('UI-03')).toEqual([
      'UI-03: действие miniUi/todo/toC/go ведёт на экран miniUi/todo/c, с которым у экрана нет общей сторис и который не старт сторис из связей сторис',
    ]);
  });
});
