import { describe, expect, test } from 'bun:test';
import { UiScene, UiSetScene } from '../../../testing/ui-arch';

const list = UiScene.screen('list');
const card = UiScene.screen('card');

describe('UI-35: сторис включает только экраны своего модуля', () => {
  test('R35-1 сторис включает экран другого модуля — строка с сторис, экраном и модулем', () => {
    const plan = UiScene.story('plan', [list, card]);
    const scene = new UiSetScene({
      modules: {
        tasks: { screens: [list], stories: [plan] },
        people: { screens: [card] },
      },
    });

    const report = scene.report();

    expect(report.rule('UI-35')).toEqual([
      'UI-35: сторис miniUi/tasks/plan: экран miniUi/people/card из модуля miniUi/people — сторис включает только экраны своего модуля',
    ]);
  });

  test('R35-2 экран вне набора — строки UI-35 нет (её даёт UI-22)', () => {
    // Экран вне набора не принадлежит ни одному модулю: модуль сторис с ним не
    // сравнить, ссылку называет UI-22.
    const stray = UiScene.screen('stray');
    const plan = UiScene.story('plan', [list, stray]);
    const scene = new UiSetScene({
      modules: { tasks: { screens: [list], stories: [plan] } },
    });

    const report = scene.report();

    expect(report.rule('UI-35')).toEqual([]);
    expect(report.rule('UI-22')).toContain(
      'UI-22: miniUi/tasks/plan ссылается на screen «stray» вне набора UI и домена',
    );
  });
});
