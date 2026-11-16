import { describe, expect, test } from 'bun:test';
import { CreateTaskUcDef } from 'dmg-core/testing/example';
import { UiScene } from '../../../testing/ui-arch';

const LOCAL = { label: 'Локальное', description: 'Меняет состояние.' };
const run = (locals: Record<string, typeof LOCAL>) =>
  new UiScene({
    screens: [
      UiScene.screen('a', {
        actions: { pick: UiScene.call(CreateTaskUcDef) },
        locals,
      }),
    ],
  }).report();

describe('UI-21: имена действий и локальных действий не пересекаются', () => {
  test('нарушение: одно имя и у действия, и у локального действия', () => {
    const report = run({ pick: LOCAL });

    expect(report.code).toBe(1);
    expect(report.rule('UI-21')).toEqual([
      'UI-21: экран miniUi/todo/a: имя pick и у действия, и у локального действия',
    ]);
  });

  test('без нарушения: имена разные', () => {
    expect(run({ toggle: LOCAL }).rule('UI-21')).toEqual([]);
  });
});
