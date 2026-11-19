import { describe, expect, test } from 'bun:test';
import { CreateTaskUcDef } from 'dmg-core/testing/example';
import { UiScene } from '../../testing/ui-arch';
import type { ScreenDef } from './screen-def';
import { StoryDoors } from './story-doors';

// Дверь экрана — действие без UC, которое ведёт на старт сторис приложения,
// связанной от сторис с этим экраном. Сцена: `hub` — экран сторис `main`,
// связи `main` — `alpha`, `beta`, `one`, `two`, `ghost`. `ghost` в приложение
// не входит, `lone` входит, но связана не от `main`, а от `side`.

const HINT_ALPHA = 'Подсказка альфы';
const HINT_ONE = 'Подсказка первой';
const HINT_TWO = 'Подсказка второй';
const HINT_GHOST = 'Подсказка вне приложения';
const HINT_LONE = 'Подсказка одинокой';
const OWN = 'Своя подсказка действия';

const alphaScreen = UiScene.screen('alphaScreen');
const alphaInner = UiScene.screen('alphaInner');
const alpha = UiScene.story('alpha', [alphaScreen, alphaInner], {
  hint: HINT_ALPHA,
});
const betaScreen = UiScene.screen('betaScreen');
const beta = UiScene.story('beta', [betaScreen]);
const commonScreen = UiScene.screen('commonScreen');
const one = UiScene.story('one', [commonScreen], { hint: HINT_ONE });
const two = UiScene.story('two', [commonScreen], { hint: HINT_TWO });
const ghostScreen = UiScene.screen('ghostScreen');
const ghost = UiScene.story('ghost', [ghostScreen], { hint: HINT_GHOST });
const loneScreen = UiScene.screen('loneScreen');
const lone = UiScene.story('lone', [loneScreen], { hint: HINT_LONE });

const hub: ScreenDef = UiScene.screen('hub', {
  actions: {
    toAlpha: UiScene.jump(alphaScreen),
    toAlphaOwn: { ...UiScene.jump(alphaScreen), hint: OWN },
    toBeta: UiScene.jump(betaScreen),
    toBoth: UiScene.jump(alphaScreen, betaScreen),
    toBothReverse: UiScene.jump(betaScreen, alphaScreen),
    toCommon: UiScene.jump(commonScreen),
    toGhost: UiScene.jump(ghostScreen),
    toLone: UiScene.jump(loneScreen),
    toInner: UiScene.jump(alphaInner),
    toSelf: { label: 'Остаться', description: 'Свой экран.', to: () => [hub] },
    toSelfAndAlpha: {
      label: 'Остаться или уйти',
      description: 'Свой экран и старт сторис.',
      to: () => [hub, alphaScreen],
    },
    withUc: { ...UiScene.jump(alphaScreen), uc: CreateTaskUcDef },
    plain: { label: 'Выйти', description: 'Без перехода и UC.' },
  },
});
const main = UiScene.story('main', [hub], {
  leads: () => [alpha, beta, one, two, ghost],
});
const sideScreen = UiScene.screen('sideScreen');
const side = UiScene.story('side', [sideScreen], { leads: () => [lone] });

const scene = new UiScene({
  screens: [
    hub,
    alphaScreen,
    alphaInner,
    betaScreen,
    commonScreen,
    ghostScreen,
    loneScreen,
    sideScreen,
  ],
  stories: [main, alpha, beta, one, two, ghost, lone, side],
  appStories: [main, alpha, beta, one, two, lone, side],
});
const doors = StoryDoors.of(scene.app);

const action = (name: string) => {
  const found = hub.actions[name];
  if (found === undefined) throw new Error(`у hub нет действия ${name}`);
  return found;
};
const of = (name: string) => doors.of(hub, action(name));
const hint = (name: string) => doors.hint(hub, action(name));

describe('StoryDoors.of: сторис, в которые ведёт действие экрана', () => {
  test('дверь: переход на старт сторис приложения, связанной от сторис экрана', () => {
    expect(of('toAlpha')).toEqual([alpha]);
    expect(of('toBeta')).toEqual([beta]);
  });

  test('не дверь: у действия есть UC', () => {
    expect(of('withUc')).toEqual([]);
  });

  test('не дверь: у действия нет перехода', () => {
    expect(of('plain')).toEqual([]);
  });

  test('не дверь: переход на свой экран', () => {
    expect(of('toSelf')).toEqual([]);
  });

  test('свой экран среди целей не мешает двери: считается старт сторис', () => {
    expect(of('toSelfAndAlpha')).toEqual([alpha]);
  });

  test('не дверь: сторис вне приложения', () => {
    expect(of('toGhost')).toEqual([]);
  });

  test('не дверь: сторис приложения, но связи от сторис этого экрана к ней нет', () => {
    expect(of('toLone')).toEqual([]);
  });

  test('не дверь: переход не на старт сторис, а на её внутренний экран', () => {
    expect(of('toInner')).toEqual([]);
  });

  test('несколько сторис-целей: все, в порядке связей сторис экрана', () => {
    expect(of('toBoth')).toEqual([alpha, beta]);
    expect(of('toBothReverse')).toEqual([alpha, beta]);
    expect(of('toCommon')).toEqual([one, two]);
  });

  test('без приложения дверей нет', () => {
    const none = StoryDoors.of(undefined);

    expect(none.of(hub, action('toAlpha'))).toEqual([]);
    expect(none.of(hub, action('toCommon'))).toEqual([]);
  });
});

describe('StoryDoors.hint: подсказка двери', () => {
  test('одна сторис-цель с подсказкой — её подсказка', () => {
    expect(hint('toAlpha')).toBe(HINT_ALPHA);
  });

  test('одна сторис-цель без подсказки — подсказки нет', () => {
    expect(hint('toBeta')).toBeUndefined();
  });

  test('своя подсказка действия побеждает подсказку сторис', () => {
    expect(hint('toAlphaOwn')).toBe(OWN);
  });

  test('две и более сторис-цели — подсказки нет, даже если у них она есть', () => {
    expect(hint('toCommon')).toBeUndefined();
    expect(hint('toBoth')).toBeUndefined();
  });

  test('не дверь — подсказка сторис не подставляется', () => {
    expect(hint('toGhost')).toBeUndefined();
    expect(hint('toLone')).toBeUndefined();
    expect(hint('withUc')).toBeUndefined();
    expect(hint('plain')).toBeUndefined();
    expect(hint('toInner')).toBeUndefined();
  });

  test('без приложения подсказки сторис нет', () => {
    expect(
      StoryDoors.of(undefined).hint(hub, action('toAlpha')),
    ).toBeUndefined();
  });
});
