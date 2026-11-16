import { describe, expect, test } from 'bun:test';
import { DomainIds } from 'dmg-core/graph';
import {
  CreateTaskUcDef,
  ExampleAppDef,
  GetTaskUcDef,
  ListTasksUcDef,
  TaskErrors,
} from 'dmg-core/testing/example';
import { UiScene } from '../../../testing/ui-arch';

const run = (over: Parameters<typeof UiScene.screen>[1]) =>
  new UiScene({ screens: [UiScene.screen('a', over)] }).report();

describe('UI-15: перехваченная ошибка есть среди ошибок UC экрана', () => {
  test('нарушение: ни один UC экрана не объявляет ошибку', () => {
    const error = new DomainIds(ExampleAppDef).error(TaskErrors.TOO_MANY_OPEN);

    const report = run({
      reads: [ListTasksUcDef],
      catches: [TaskErrors.TOO_MANY_OPEN],
    });

    expect(report.code).toBe(1);
    expect(report.rule('UI-15')).toEqual([
      `UI-15: экран miniUi/todo/a перехватывает ${error}, которой нет у его UC`,
    ]);
  });

  test('без нарушения: ошибка второго UC экрана — вызываемого действием', () => {
    const report = run({
      reads: [ListTasksUcDef],
      actions: { create: UiScene.call(CreateTaskUcDef) },
      catches: [TaskErrors.TOO_MANY_OPEN],
    });

    expect(report.rule('UI-15')).toEqual([]);
  });

  test('без нарушения: ошибка UC загрузки', () => {
    const report = run({
      reads: [GetTaskUcDef],
      catches: [TaskErrors.NOT_FOUND],
    });

    expect(report.rule('UI-15')).toEqual([]);
  });
});
