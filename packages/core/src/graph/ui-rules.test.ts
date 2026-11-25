import { describe, expect, test } from 'bun:test';
import { ExampleUiSetDef } from 'dmg-ui/example';
import { UiRules } from './ui-rules';

// Граф учебного примера без нарушений — `testing/example/example-dialog.arch.test.ts`.

describe('UiRules', () => {
  test('правила графа по порядку ID: UI-01…UI-27 без UI-06 — полноту держат конструкторы реестров', () => {
    const expected = Array.from(
      { length: 27 },
      (_, i) => `UI-${String(i + 1).padStart(2, '0')}`,
    ).filter((id) => id !== 'UI-06');

    expect(UiRules.of(ExampleUiSetDef).map((rule) => rule.id)).toEqual(
      expected,
    );
  });
});
