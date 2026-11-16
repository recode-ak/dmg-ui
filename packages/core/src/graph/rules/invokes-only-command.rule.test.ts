import { describe, expect, test } from 'bun:test';
import { CreateTaskUcDef, ListTasksUcDef } from 'dmg-core/testing/example';
import { UiScene } from '../../../testing/ui-arch';

const lines = (uc: typeof CreateTaskUcDef | typeof ListTasksUcDef) => {
  const screen = UiScene.screen('a', { actions: { list: UiScene.call(uc) } });
  return new UiScene({ screens: [screen] }).report();
};

describe('UI-09: действие вызывает только command UC', () => {
  test('нарушение: действие вызывает query UC', () => {
    const report = lines(ListTasksUcDef);

    expect(report.code).toBe(1);
    expect(report.rule('UI-09')).toEqual([
      'UI-09: действие miniUi/todo/a/list вызывает query UC example/todo/listTasks: чтение — в загрузке экрана',
    ]);
  });

  test('без нарушения: действие вызывает command UC', () => {
    expect(lines(CreateTaskUcDef).rule('UI-09')).toEqual([]);
  });
});
