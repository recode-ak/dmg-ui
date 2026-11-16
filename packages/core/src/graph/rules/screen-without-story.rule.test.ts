import { describe, expect, test } from 'bun:test';
import { UiScene } from '../../../testing/ui-arch';

describe('UI-02: экран входит хотя бы в одну сторис', () => {
  test('нарушение: экран вне всех сторис', () => {
    const [a, b] = [UiScene.screen('a'), UiScene.screen('b')];
    const scene = new UiScene({
      screens: [a, b],
      stories: [UiScene.story('s', [a])],
    });

    const report = scene.report();

    expect(report.code).toBe(1);
    expect(report.rule('UI-02')).toEqual([
      'UI-02: экран miniUi/todo/b не входит ни в одну сторис',
    ]);
  });

  test('без нарушения: экран в двух сторис, в одной из них — тоже', () => {
    const [a, b] = [UiScene.screen('a'), UiScene.screen('b')];
    const scene = new UiScene({
      screens: [a, b],
      stories: [UiScene.story('s1', [a, b]), UiScene.story('s2', [b])],
    });

    expect(scene.report().rule('UI-02')).toEqual([]);
  });
});
