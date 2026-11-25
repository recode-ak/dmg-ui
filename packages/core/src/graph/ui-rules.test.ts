import { describe, expect, test } from 'bun:test';
import { ExampleUiSetDef } from 'dmg-ui/example';
import { UiRules } from './ui-rules';

// Граф учебного примера без нарушений — `packages/example/src/runners/dialog/example-dialog.arch.test.ts`.

describe('UiRules', () => {
  test('правила графа по порядку ID: UI-01…UI-27 без UI-06, затем UI-35…UI-37 — полноту держат конструкторы реестров', () => {
    const ids = (from: number, to: number) =>
      Array.from(
        { length: to - from + 1 },
        (_, i) => `UI-${String(from + i).padStart(2, '0')}`,
      );
    const expected = [
      ...ids(1, 27).filter((id) => id !== 'UI-06'),
      ...ids(35, 37),
    ];

    expect(UiRules.of(ExampleUiSetDef).map((rule) => rule.id)).toEqual(
      expected,
    );
  });
});
