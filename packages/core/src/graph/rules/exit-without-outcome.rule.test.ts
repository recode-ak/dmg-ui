import { describe, expect, test } from 'bun:test';
import { UiScene } from '../../../testing/ui-arch';

const a = UiScene.screen('a', {
  exits: { done: { label: 'Готово', description: 'Экран завершён.' } },
});
const closed = {
  label: 'Закрыто',
  description: 'Экран завершён.',
  exits: [UiScene.exit(a, 'done')],
};

describe('UI-04: выход экрана связан с исходом каждой его сторис', () => {
  test('нарушение: выход без исхода сторис', () => {
    const scene = new UiScene({
      screens: [a],
      stories: [UiScene.story('s1', [a])],
    });

    const report = scene.report();

    expect(report.code).toBe(1);
    expect(report.rule('UI-04')).toEqual([
      'UI-04: выход done экрана miniUi/todo/a не связан с исходом сторис miniUi/todo/s1',
    ]);
  });

  test('без нарушения: экран в двух сторис, исход есть в обеих', () => {
    const scene = new UiScene({
      screens: [a],
      stories: [
        UiScene.story('s1', [a], { outcomes: { closed } }),
        UiScene.story('s2', [a], { outcomes: { closed } }),
      ],
    });

    expect(scene.report().rule('UI-04')).toEqual([]);
  });

  test('нарушение только в той сторис, где исхода нет', () => {
    const scene = new UiScene({
      screens: [a],
      stories: [
        UiScene.story('s1', [a], { outcomes: { closed } }),
        UiScene.story('s2', [a]),
      ],
    });

    expect(scene.report().rule('UI-04')).toEqual([
      'UI-04: выход done экрана miniUi/todo/a не связан с исходом сторис miniUi/todo/s2',
    ]);
  });
});
