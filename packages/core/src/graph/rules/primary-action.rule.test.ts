import { describe, expect, test } from 'bun:test';
import { CreateTaskUcDef } from 'dmg-core/testing/example';
import { UiScene } from '../../../testing/ui-arch';

const run = (over: Parameters<typeof UiScene.screen>[1]) =>
  new UiScene({ screens: [UiScene.screen('a', over)] }).report();

describe('UI-16: основное действие объявлено среди действий экрана', () => {
  test('нарушение: primary без такого действия', () => {
    const report = run({ primary: 'create' });

    expect(report.code).toBe(1);
    expect(report.rule('UI-16')).toEqual([
      'UI-16: экран miniUi/todo/a: основное действие create не объявлено',
    ]);
  });

  test('без нарушения: primary — объявленное действие', () => {
    const report = run({
      primary: 'create',
      actions: { create: UiScene.call(CreateTaskUcDef) },
    });

    expect(report.rule('UI-16')).toEqual([]);
  });

  test('без нарушения: основного действия нет', () => {
    expect(run({}).rule('UI-16')).toEqual([]);
  });
});
