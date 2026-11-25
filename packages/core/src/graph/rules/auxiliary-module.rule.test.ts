import { describe, expect, test } from 'bun:test';
import { UiScene, UiSetScene } from '../../../testing/ui-arch';

// Меню menu модуля tasks — корневая сторис набора: её связи UI-37 не считает,
// поэтому источник — сторис, в которую ведёт меню.

const person = UiScene.screen('person');
const view = UiScene.story('view', [person]);

describe('UI-37: во вспомогательный модуль ведут не меньше двух модулей', () => {
  test('R37-1 в модуль ведёт один модуль — строка с именем источника', () => {
    const plan = UiScene.story('plan', [UiScene.screen('planned')], {
      leads: () => [view],
    });
    const menu = UiScene.story('menu', [UiScene.screen('hub')], {
      leads: () => [plan],
    });
    const scene = new UiSetScene({
      modules: {
        tasks: {
          screens: [...menu.screens, ...plan.screens],
          stories: [menu, plan],
        },
        people: { screens: [person], stories: [view] },
      },
    });

    const report = scene.report();

    expect(report.rule('UI-37')).toEqual([
      'UI-37: модуль miniUi/people: вспомогательный, в него ведёт только miniUi/tasks — сторис у единственного пользователя',
    ]);
  });

  test('R37-2 ведут два модуля — без строки', () => {
    const plan = UiScene.story('plan', [UiScene.screen('planned')], {
      leads: () => [view],
    });
    const digest = UiScene.story('digest', [UiScene.screen('totals')], {
      leads: () => [view],
    });
    const menu = UiScene.story('menu', [UiScene.screen('hub')], {
      leads: () => [plan, digest],
    });
    const scene = new UiSetScene({
      modules: {
        tasks: {
          screens: [...menu.screens, ...plan.screens],
          stories: [menu, plan],
        },
        reports: { screens: [...digest.screens], stories: [digest] },
        people: { screens: [person], stories: [view] },
      },
    });

    expect(scene.report().rule('UI-37')).toEqual([]);
  });

  test('R37-3 модуль без сторис — строка «не ведёт ни один модуль»', () => {
    const menu = UiScene.story('menu', [UiScene.screen('hub')]);
    const scene = new UiSetScene({
      modules: {
        tasks: { screens: [...menu.screens], stories: [menu] },
        people: { screens: [person] },
      },
    });

    expect(scene.report().rule('UI-37')).toEqual([
      'UI-37: модуль miniUi/people: вспомогательный, в него не ведёт ни один модуль',
    ]);
  });
});
