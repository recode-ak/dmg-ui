import { describe, expect, test } from 'bun:test';
import {
  CompleteTaskUcDef,
  CreateTaskUcDef,
  ListTasksUcDef,
} from 'dmg-core/testing/example';
import { UiScene } from '../../../testing/ui-arch';

describe('UI-08: загрузка и уведомление читают только query UC', () => {
  test('нарушение: экран читает command UC', () => {
    const screen = UiScene.screen('a', { reads: [CreateTaskUcDef] });

    const report = new UiScene({ screens: [screen] }).report();

    expect(report.code).toBe(1);
    expect(report.rule('UI-08')).toEqual([
      'UI-08: экран miniUi/todo/a читает command UC example/todo/createTask',
    ]);
  });

  test('нарушение: уведомление читает command UC', () => {
    const n = UiScene.notification('n', { reads: [CompleteTaskUcDef] });

    const report = new UiScene({ screens: [], notifications: [n] }).report();

    expect(report.rule('UI-08')).toEqual([
      'UI-08: уведомление miniUi/todo/n читает command UC example/todo/completeTask',
    ]);
  });

  test('без нарушения: экран и уведомление читают query UC', () => {
    const screen = UiScene.screen('a', { reads: [ListTasksUcDef] });
    const n = UiScene.notification('n', { reads: [ListTasksUcDef] });

    const scene = new UiScene({ screens: [screen], notifications: [n] });

    expect(scene.report().rule('UI-08')).toEqual([]);
  });
});
