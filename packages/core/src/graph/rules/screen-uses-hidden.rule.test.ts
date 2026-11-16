import { describe, expect, test } from 'bun:test';
import { GetTaskUcDef, ListTasksUcDef } from 'dmg-core/testing/example';
import { UiScene } from '../../../testing/ui-arch';

describe('UI-12: экран вызывает только UC для человека (visible)', () => {
  test('нарушение: экран читает UC с visible: false', () => {
    const screen = UiScene.screen('a', { reads: [GetTaskUcDef] });

    const report = new UiScene({ screens: [screen] }).report();

    expect(report.code).toBe(1);
    expect(report.rule('UI-12')).toEqual([
      'UI-12: miniUi/todo/a вызывает UC example/todo/getTask, не предназначенный человеку (visible: false)',
    ]);
  });

  test('нарушение: уведомление читает UC с visible: false', () => {
    const n = UiScene.notification('n', { reads: [GetTaskUcDef] });

    const report = new UiScene({ screens: [], notifications: [n] }).report();

    expect(report.rule('UI-12')).toEqual([
      'UI-12: miniUi/todo/n вызывает UC example/todo/getTask, не предназначенный человеку (visible: false)',
    ]);
  });

  test('без нарушения: экран читает UC с visible: true', () => {
    const screen = UiScene.screen('a', { reads: [ListTasksUcDef] });

    const report = new UiScene({ screens: [screen] }).report();

    expect(report.rule('UI-12')).toEqual([]);
  });
});
