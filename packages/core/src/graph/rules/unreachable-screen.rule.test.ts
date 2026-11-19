import { describe, expect, test } from 'bun:test';
import { UiScene } from '../../../testing/ui-arch';

const c = UiScene.screen('c');
const b = UiScene.screen('b', { actions: { go: UiScene.jump(c) } });
const a = UiScene.screen('a', { actions: { go: UiScene.jump(b) } });
const lone = UiScene.screen('lone');

describe('UI-07: экран достижим от входов приложения', () => {
  test('нарушение: к экрану не ведёт ни вход, ни переход', () => {
    const scene = new UiScene({
      screens: [a, lone],
      stories: [UiScene.story('s', [a, lone])],
    });

    const report = scene.report();

    expect(report.code).toBe(1);
    expect(report.rule('UI-07')).toEqual([
      'UI-07: приложение miniConsole: экран miniUi/todo/lone недостижим от входов',
    ]);
  });

  test('без нарушения: цепочка переходов от входа', () => {
    const scene = new UiScene({
      screens: [a, b, c],
      stories: [UiScene.story('s', [a, b, c])],
    });

    expect(scene.report().rule('UI-07')).toEqual([]);
  });

  test('без нарушения: экран достижим только по ссылке уведомления', () => {
    const n = UiScene.notification('n', { links: () => [lone] });
    const scene = new UiScene({
      screens: [a, b, c, lone],
      stories: [UiScene.story('s', [a, b, c, lone])],
      notifications: [n],
    });

    expect(scene.report().rule('UI-07')).toEqual([]);
  });

  test('без нарушения: экран достижим только по цели-адресу исхода сторис', () => {
    const done = UiScene.exiting('done');
    const scene = new UiScene({
      screens: [done, lone],
      stories: [
        UiScene.story('s', [done], {
          outcomes: { finished: UiScene.outcome(done, lone.at({})) },
        }),
        UiScene.story('t', [lone]),
      ],
    });

    expect(scene.report().rule('UI-07')).toEqual([]);
  });

  test('нарушение: к экрану ведёт только цель-адрес исхода сторис вне приложения', () => {
    const done = UiScene.exiting('done');
    const outside = UiScene.story('s', [done], {
      outcomes: { finished: UiScene.outcome(done, lone.at({})) },
    });
    const own = UiScene.story('u', [done]);
    const holder = UiScene.story('t', [lone]);
    const scene = new UiScene({
      screens: [done, lone],
      stories: [outside, own, holder],
      appStories: [own, holder],
    });

    expect(scene.report().rule('UI-07')).toEqual([
      'UI-07: приложение miniConsole: экран miniUi/todo/lone недостижим от входов',
    ]);
  });
});
