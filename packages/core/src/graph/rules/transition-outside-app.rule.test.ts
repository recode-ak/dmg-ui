import { describe, expect, test } from 'bun:test';
import { UiScene } from '../../../testing/ui-arch';

const b = UiScene.screen('b');
const a = UiScene.screen('a', { actions: { go: UiScene.jump(b) } });
const s1 = UiScene.story('s1', [a]);
const s2 = UiScene.story('s2', [b]);

describe('UI-05: переход и вход — на экран из сторис своего приложения UI', () => {
  test('нарушение: цель перехода вне сторис приложения', () => {
    const scene = new UiScene({
      screens: [a, b],
      stories: [s1, s2],
      appStories: [s1],
    });

    const report = scene.report();

    expect(report.code).toBe(1);
    expect(report.rule('UI-05')).toEqual([
      'UI-05: приложение miniConsole: экран miniUi/todo/a ведёт на miniUi/todo/b, которого нет в его сторис',
    ]);
  });

  test('нарушение: вход приложения на экран вне его сторис', () => {
    const scene = new UiScene({
      screens: [a, b],
      stories: [s1, s2],
      appStories: [s1],
      entries: { start: UiScene.entry(b) },
    });

    const [line, ...rest] = scene.report().rule('UI-05');

    expect(rest).toEqual([]);
    expect(line).toStartWith('UI-05: приложение miniConsole: ');
    expect(line).toContain('miniUi/todo/b');
  });

  test('без нарушения: переход и вход — на экраны сторис приложения', () => {
    const scene = new UiScene({ screens: [a, b], stories: [s1, s2] });

    expect(scene.report().rule('UI-05')).toEqual([]);
  });
});
