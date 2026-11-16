import { describe, expect, test } from 'bun:test';
import {
  AssignTaskUcDef,
  CompleteTaskUcDef,
  CreateTaskUcDef,
  ListTasksUcDef,
} from 'dmg-core/testing/example';
import { UiScene } from '../../../testing/ui-arch';

describe('UI-11: UC для человека вызывает хотя бы один экран', () => {
  test('нарушение: три visible-UC без экрана, по id', () => {
    const screen = UiScene.screen('a', { reads: [ListTasksUcDef] });

    const report = new UiScene({ screens: [screen] }).report();

    expect(report.code).toBe(1);
    expect(report.rule('UI-11')).toEqual([
      'UI-11: UC example/todo/assignTask предназначен человеку (visible), но ни один экран его не вызывает',
      'UI-11: UC example/todo/completeTask предназначен человеку (visible), но ни один экран его не вызывает',
      'UI-11: UC example/todo/createTask предназначен человеку (visible), но ни один экран его не вызывает',
    ]);
  });

  test('без нарушения: UC вызваны действиями и загрузкой экрана', () => {
    const screen = UiScene.screen('a', {
      reads: [ListTasksUcDef],
      actions: {
        assign: UiScene.call(AssignTaskUcDef),
        complete: UiScene.call(CompleteTaskUcDef),
        create: UiScene.call(CreateTaskUcDef),
      },
    });

    const report = new UiScene({ screens: [screen] }).report();

    expect(report.rule('UI-11')).toEqual([]);
  });

  test('без нарушения: UC читает только уведомление, UC вне visible не требует экрана', () => {
    const screen = UiScene.screen('a', { reads: [] });
    const n = UiScene.notification('n', { reads: [ListTasksUcDef] });

    const lines = new UiScene({ screens: [screen], notifications: [n] })
      .report()
      .rule('UI-11');

    expect(lines.join('\n')).not.toContain('listTasks');
    expect(lines.join('\n')).not.toContain('getTask');
  });
});
