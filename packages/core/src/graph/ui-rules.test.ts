import { describe, expect, test } from 'bun:test';
import { ExampleUiSetDef } from '../../testing/example';
import { UiRules } from './ui-rules';

// Граф учебного примера без нарушений — `testing/example/example-graph.test.ts`.

describe('UiRules', () => {
  test('правила идут в порядке ID: UI-01…UI-23', () => {
    const expected = Array.from(
      { length: 23 },
      (_, i) => `UI-${String(i + 1).padStart(2, '0')}`,
    );

    expect(UiRules.of(ExampleUiSetDef).map((rule) => rule.id)).toEqual(
      expected,
    );
  });
});
