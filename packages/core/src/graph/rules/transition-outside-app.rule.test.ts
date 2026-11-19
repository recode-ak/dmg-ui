import { describe, expect, test } from 'bun:test';
import { ArchReport, UiScene } from '../../../testing/ui-arch';
import { UiAppDef } from '../../manifest/ui-app-def';

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
      'UI-05: приложение miniConsole: экран miniUi/todo/a ведёт на miniUi/todo/b, которого нет в его сторис и не заявлен в связях сторис',
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

  test('нарушение один раз: два действия экрана ведут на одну цель вне сторис', () => {
    const jump = UiScene.jump(b);
    const from = UiScene.screen('from', { actions: { one: jump, two: jump } });
    const one = UiScene.story('s1', [from]);
    const scene = new UiScene({
      screens: [from, b],
      stories: [one, s2],
      appStories: [one],
    });

    expect(scene.report().rule('UI-05')).toHaveLength(1);
  });

  test('по приложению: цель в сторис приложения B — нарушение только у приложения A', () => {
    const scene = new UiScene({
      screens: [a, b],
      stories: [s1, s2],
      appStories: [s1],
    });
    const other = UiAppDef.define({
      name: 'other',
      label: 'Другое приложение',
      description: 'Второе приложение UI того же набора.',
      set: scene.set,
      channel: 'mini-channel',
      stories: [s2],
      notifications: [],
      entries: { start: UiScene.entry(b) },
    });

    const lines = ArchReport.of(
      UiScene.appOf(scene.set, [scene.app, other]),
    ).rule('UI-05');

    expect(lines).toHaveLength(1);
    expect(lines[0]).toStartWith('UI-05: приложение miniConsole: ');
  });

  test('без нарушения: цель — старт отрезанной сторис из связей сторис приложения', () => {
    const linked = UiScene.story('s1', [a], { leads: () => [s2] });
    const scene = new UiScene({
      screens: [a, b],
      stories: [linked, s2],
      appStories: [linked],
    });

    expect(scene.report().rule('UI-05')).toEqual([]);
  });

  test('нарушение: цель отрезанной сторис — не её старт', () => {
    const c = UiScene.screen('c');
    const t = UiScene.story('t', [b, c], { start: b });
    const toC = UiScene.screen('toC', { actions: { go: UiScene.jump(c) } });
    const linked = UiScene.story('s1', [toC], { leads: () => [t] });
    const scene = new UiScene({
      screens: [toC, b, c],
      stories: [linked, t],
      appStories: [linked],
    });

    expect(scene.report().rule('UI-05')).toEqual([
      'UI-05: приложение miniConsole: экран miniUi/todo/toC ведёт на miniUi/todo/c, которого нет в его сторис и не заявлен в связях сторис',
    ]);
  });

  test('нарушение: связь другой сторис приложения не оправдывает переход', () => {
    const c = UiScene.screen('c', { actions: { go: UiScene.jump(b) } });
    const linked = UiScene.story('s1', [a], { leads: () => [s2] });
    const other = UiScene.story('s3', [c]);
    const scene = new UiScene({
      screens: [a, b, c],
      stories: [linked, s2, other],
      appStories: [linked, other],
    });

    expect(scene.report().rule('UI-05')).toEqual([
      'UI-05: приложение miniConsole: экран miniUi/todo/c ведёт на miniUi/todo/b, которого нет в его сторис и не заявлен в связях сторис',
    ]);
  });

  test('нарушение: вход на экран отрезанной сторис остаётся нарушением', () => {
    const linked = UiScene.story('s1', [a], { leads: () => [s2] });
    const scene = new UiScene({
      screens: [a, b],
      stories: [linked, s2],
      appStories: [linked],
      entries: { start: UiScene.entry(b) },
    });

    expect(scene.report().rule('UI-05')).toEqual([
      'UI-05: приложение miniConsole: вход ведёт на miniUi/todo/b, которого нет в его сторис',
    ]);
  });
});
