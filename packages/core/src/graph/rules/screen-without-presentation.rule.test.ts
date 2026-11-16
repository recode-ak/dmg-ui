import { describe, expect, test } from 'bun:test';
import { UiScene } from '../../../testing/ui-arch';
import {
  StubSignalProvider,
  StubViewProvider,
} from '../../../testing/ui-graph-fixture';

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
});
