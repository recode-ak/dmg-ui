import { describe, expect, test } from 'bun:test';
import { UiScene } from '../../../testing/ui-arch';

const TEXTS = { label: 'Исход', description: 'Сторис завершена.' };
const done = { done: { label: 'Готово', description: 'Экран закрыт.' } };

describe('UI-23: форма сторис — старт и выходы исходов в её экранах', () => {
  test('нарушение: start не входит в screens', () => {
    const [a, b] = [UiScene.screen('a'), UiScene.screen('b')];
    const story = UiScene.story('s', [b], { start: a });

    const report = new UiScene({ screens: [a, b], stories: [story] }).report();

    expect(report.code).toBe(1);
    expect(report.rule('UI-23')).toEqual([
      'UI-23: сторис miniUi/todo/s: start miniUi/todo/a не входит в её экраны',
    ]);
  });

  test('нарушение: исход ссылается на выход экрана вне сторис', () => {
    const [a, b] = [UiScene.screen('a'), UiScene.screen('b', { exits: done })];
    const outcomes = {
      finished: { ...TEXTS, exits: [UiScene.exit(b, 'done')] },
    };
    const story = UiScene.story('s', [a], { outcomes });

    const report = new UiScene({ screens: [a, b], stories: [story] }).report();

    expect(report.rule('UI-23')).toEqual([
      'UI-23: сторис miniUi/todo/s: исход finished ссылается на выход экрана вне сторис',
    ]);
  });

  test('без нарушения: старт и выход исхода — экраны сторис', () => {
    const a = UiScene.screen('a', { exits: done });
    const outcomes = {
      finished: { ...TEXTS, exits: [UiScene.exit(a, 'done')] },
    };
    const story = UiScene.story('s', [a], { outcomes });

    const report = new UiScene({ screens: [a], stories: [story] }).report();

    expect(report.rule('UI-23')).toEqual([]);
  });
});
