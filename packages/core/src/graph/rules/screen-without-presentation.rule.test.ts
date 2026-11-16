import { describe, expect, test } from 'bun:test';
import { ArchReport, UiScene } from '../../../testing/ui-arch';
import {
  StubSignalProvider,
  StubViewProvider,
} from '../../../testing/ui-graph-fixture';
import { UiAppDef } from '../../manifest/ui-app-def';

const a = UiScene.screen('a');
const n = UiScene.notification('n');
const story = UiScene.story('s', [a]);
const scene = new UiScene({
  screens: [a],
  stories: [story],
  notifications: [n],
});

describe('UI-06: экран и уведомление приложения UI имеют представление', () => {
  test('нарушение: ни одного ребра presents', () => {
    const report = scene.report();

    expect(report.code).toBe(1);
    expect(report.rule('UI-06')).toEqual([
      'UI-06: приложение miniConsole: у экрана miniUi/todo/a нет представления в канале',
      'UI-06: приложение miniConsole: у уведомления miniUi/todo/n нет представления в канале',
    ]);
  });

  test('нарушение: представлен экран, уведомление — нет', () => {
    const view = new StubViewProvider(scene.set, scene.app, [a]);

    expect(scene.report([view]).rule('UI-06')).toEqual([
      'UI-06: приложение miniConsole: у уведомления miniUi/todo/n нет представления в канале',
    ]);
  });

  test('без нарушения: канал показывает набор по умолчанию', () => {
    const view = new StubViewProvider(scene.set, scene.app, [scene.set]);

    expect(scene.report([view]).rule('UI-06')).toEqual([]);
  });

  test('без нарушения: представление ставит узел под приложением UI', () => {
    const signal = new StubSignalProvider(scene.set, scene.app, {});
    const view = new StubViewProvider(
      scene.set,
      scene.app,
      [a, n],
      signal.nodeId,
    );

    expect(scene.report([signal, view]).rule('UI-06')).toEqual([]);
  });

  test('без нарушения: экран вне сторис приложения не требует представления', () => {
    const bare = new UiScene({
      screens: [a],
      stories: [story],
      notifications: [n],
      appStories: [],
      appNotifications: [],
    });

    expect(bare.report().rule('UI-06')).toEqual([]);
  });

  test('по приложению: представление первого приложения не закрывает второе', () => {
    const b = UiScene.screen('b');
    const [s1, s2] = [UiScene.story('s1', [a]), UiScene.story('s2', [b])];
    const two = new UiScene({
      screens: [a, b],
      stories: [s1, s2],
      appStories: [s1],
    });
    const other = UiAppDef.define({
      name: 'other',
      label: 'Другое приложение',
      description: 'Второе приложение UI того же набора.',
      set: two.set,
      channel: 'mini-channel',
      stories: [s2],
      notifications: [],
      entries: { start: UiScene.entry(b) },
    });
    const view = new StubViewProvider(two.set, two.app, [two.set]);

    const lines = ArchReport.of(
      UiScene.appOf(two.set, [two.app, other], [view]),
    ).rule('UI-06');

    expect(lines).toEqual([
      'UI-06: приложение other: у экрана miniUi/todo/b нет представления в канале',
    ]);
  });
});
