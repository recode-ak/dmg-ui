import { describe, expect, test } from 'bun:test';
import { CreateTaskUcDef } from 'dmg-core/testing/example';
import { UiScene } from '../../testing/ui-arch';
import { AppReach } from './app-reach';
import type { ScreenDef } from './screen-def';

// Сторис `ghost` связана с `root`, но в приложение не входит: действия `hub`,
// ведущие только на её экран, отрезаны. `deep` — дальняя связь `ghost`.

const deepScreen = UiScene.screen('deepScreen');
const deep = UiScene.story('deep', [deepScreen]);
const ghostScreen = UiScene.screen('ghostScreen');
const ghost = UiScene.story('ghost', [ghostScreen], { leads: () => [deep] });
const near = UiScene.screen('near');
const hub: ScreenDef = UiScene.screen('hub', {
  actions: {
    toGhost: UiScene.jump(ghostScreen),
    toNear: UiScene.jump(near),
    toBoth: UiScene.jump(ghostScreen, near),
    toSelf: { label: 'Остаться', description: 'Свой экран.', to: () => [hub] },
    plain: { label: 'Выйти', description: 'Без перехода и UC.' },
    withUc: { ...UiScene.jump(ghostScreen), uc: CreateTaskUcDef },
  },
});
const root = UiScene.story('root', [hub, near], { leads: () => [ghost] });
const sibScreen = UiScene.screen('sibScreen');
const sibling = UiScene.story('sibling', [sibScreen], {
  leads: () => [ghost],
});
const sceneOf = (appStories: readonly (typeof root)[]) =>
  new UiScene({
    screens: [hub, near, ghostScreen, deepScreen, sibScreen],
    stories: [root, ghost, deep, sibling],
    appStories,
  });

const action = (name: string) => {
  const found = hub.actions[name];
  if (found === undefined) throw new Error(`у hub нет действия ${name}`);
  return found;
};
const cuts = (name: string, reach = AppReach.of(sceneOf([root]).app)) =>
  reach.cuts(hub, action(name));

describe('AppReach.cuts: действие, ведущее только в сторис вне приложения', () => {
  test('отрезано: есть to, нет uc, цель вне экранов сторис приложения', () => {
    expect(cuts('toGhost')).toBe(true);
  });

  test('не отрезано: цель — экран сторис приложения', () => {
    expect(cuts('toNear')).toBe(false);
  });

  test('не отрезано: среди целей есть экран приложения', () => {
    expect(cuts('toBoth')).toBe(false);
  });

  test('не отрезано: переход на свой экран', () => {
    expect(cuts('toSelf')).toBe(false);
  });

  test('не отрезано: у действия есть uc', () => {
    expect(cuts('withUc')).toBe(false);
  });

  test('не отрезано: у действия нет перехода', () => {
    expect(cuts('plain')).toBe(false);
  });

  test('не отрезано: сторис-цель входит в приложение', () => {
    const reach = AppReach.of(sceneOf([root, ghost]).app);

    expect(cuts('toGhost', reach)).toBe(false);
  });

  test('отрезано и на не-старт экран отрезанной сторис: лишнее называет UI-05', () => {
    const [start, inner] = [UiScene.screen('start'), UiScene.screen('inner')];
    const far = UiScene.story('far', [start, inner], { start });
    const from = UiScene.screen('from', {
      actions: { toInner: UiScene.jump(inner) },
    });
    const own = UiScene.story('own', [from], { leads: () => [far] });
    const scene = new UiScene({
      screens: [from, start, inner],
      stories: [own, far],
      appStories: [own],
    });
    const toInner = from.actions.toInner;
    if (toInner === undefined) throw new Error('у from нет действия toInner');

    expect(AppReach.of(scene.app).cuts(from, toInner)).toBe(true);
  });

  test('без приложения ничего не отрезано', () => {
    expect(cuts('toGhost', AppReach.of(undefined))).toBe(false);
  });
});

describe('AppReach.omitted: сторис из связей приложения, которых в нём нет', () => {
  test('связанная сторис вне приложения; дальние связи не считаются', () => {
    const omitted = AppReach.of(sceneOf([root]).app).omitted();

    expect(omitted).toHaveLength(1);
    expect(omitted[0]).toBe(ghost);
  });

  test('одна сторис по связям двух сторис приложения — в списке один раз', () => {
    const omitted = AppReach.of(sceneOf([root, sibling]).app).omitted();

    expect(omitted).toHaveLength(1);
    expect(omitted[0]).toBe(ghost);
  });

  test('связь сторис, которая сама в приложении, считается от неё', () => {
    const omitted = AppReach.of(sceneOf([root, ghost]).app).omitted();

    expect(omitted).toHaveLength(1);
    expect(omitted[0]).toBe(deep);
  });

  test('без приложения пусто', () => {
    expect(AppReach.of(undefined).omitted()).toEqual([]);
  });
});
