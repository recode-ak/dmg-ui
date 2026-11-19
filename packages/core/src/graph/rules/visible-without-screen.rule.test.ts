import { describe, expect, test } from 'bun:test';
import {
  AssignTaskUcDef,
  CompleteTasksUcDef,
  CompleteTaskUcDef,
  CreateTaskUcDef,
  GetUserUcDef,
  ListAssignedTasksUcDef,
  ListTasksUcDef,
} from 'dmg-core/testing/example';
import { UiScene } from '../../../testing/ui-arch';

describe('UI-11: UC для человека вызывает хотя бы один экран', () => {
  test('нарушение: шесть visible-UC без экрана, по id', () => {
    const screen = UiScene.screen('a', { reads: [ListTasksUcDef] });

    const report = new UiScene({ screens: [screen] }).report();

    expect(report.code).toBe(1);
    expect(report.rule('UI-11')).toEqual([
      'UI-11: UC example/todo/assignTask предназначен человеку (visible), но ни один экран его не вызывает',
      'UI-11: UC example/todo/completeTask предназначен человеку (visible), но ни один экран его не вызывает',
      'UI-11: UC example/todo/completeTasks предназначен человеку (visible), но ни один экран его не вызывает',
      'UI-11: UC example/todo/createTask предназначен человеку (visible), но ни один экран его не вызывает',
      'UI-11: UC example/todo/listAssignedTasks предназначен человеку (visible), но ни один экран его не вызывает',
      'UI-11: UC example/users/getUser предназначен человеку (visible), но ни один экран его не вызывает',
    ]);
  });

  test('без нарушения: UC вызваны действиями и загрузкой экрана', () => {
    const screen = UiScene.screen('a', {
      reads: [ListTasksUcDef],
      actions: {
        assign: UiScene.call(AssignTaskUcDef),
        complete: UiScene.call(CompleteTaskUcDef),
        completeAll: UiScene.call(CompleteTasksUcDef),
        create: UiScene.call(CreateTaskUcDef),
      },
    });
    const assigned = UiScene.screen('b', { reads: [ListAssignedTasksUcDef] });
    const user = UiScene.screen('c', { reads: [GetUserUcDef] });

    const report = new UiScene({ screens: [screen, assigned, user] }).report();

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
