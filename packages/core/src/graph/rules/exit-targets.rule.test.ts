import { describe, expect, test } from 'bun:test';
import * as v from 'valibot';
import { UiScene } from '../../../testing/ui-arch';
import { Address } from '../../address/address';
import type { AnyScreenDef } from '../../manifest/screen-def';

const a = UiScene.exiting('a');
const paged: AnyScreenDef = UiScene.screen('paged', {
  params: v.strictObject({ n: v.number() }),
});
const scene = (
  first: Parameters<typeof UiScene.outcome>[1],
  second: Parameters<typeof UiScene.outcome>[1],
  appStories?: readonly ('s1' | 's2')[],
) => {
  const s1 = UiScene.story('s1', [a], {
    outcomes: { finished: UiScene.outcome(a, first) },
  });
  const s2 = UiScene.story('s2', [a], {
    outcomes: { finished: UiScene.outcome(a, second) },
  });
  return new UiScene({
    screens: [a, paged],
    stories: [s1, s2, UiScene.story('p', [paged])],
    appStories: appStories?.map((name) => (name === 's1' ? s1 : s2)),
  });
};

describe('UI-25: выход экрана ведёт к одной цели во всех сторис приложения', () => {
  test('нарушение: исходы двух сторис ведут по одному выходу на разные цели', () => {
    const report = scene('home', 'back').report();

    expect(report.code).toBe(1);
    expect(report.rule('UI-25')).toEqual([
      'UI-25: приложение miniConsole: выход done экрана miniUi/todo/a привязан к исходам сторис miniUi/todo/s1, miniUi/todo/s2 с разными целями',
    ]);
  });

  test('нарушение: цели-адреса с разными параметрами — разные цели', () => {
    const second = new Address(paged, { n: 1 });

    expect(
      scene(new Address(paged, { n: 0 }), second)
        .report()
        .rule('UI-25'),
    ).toHaveLength(1);
  });

  test('без нарушения: обе сторис — home', () => {
    expect(scene('home', 'home').report().rule('UI-25')).toEqual([]);
  });

  test('без нарушения: цель не названа и названа back — это одна цель', () => {
    expect(scene(undefined, 'back').report().rule('UI-25')).toEqual([]);
  });

  test('без нарушения: цели-адреса равны по экрану и параметрам', () => {
    const first = new Address(paged, { n: 0 });
    const second = new Address(paged, { n: 0 });

    expect(scene(first, second).report().rule('UI-25')).toEqual([]);
  });

  test('без нарушения: расхождение вне приложения не в счёт', () => {
    expect(scene('home', 'back', ['s1']).report().rule('UI-25')).toEqual([]);
  });
});
