import { describe, expect, test } from 'bun:test';
import { ArchChecker } from 'dmg-core/arch';
import { ArchReport, UiScene } from '../../testing/ui-arch';
import { ExampleUiSetDef } from '../../testing/ui-fixture';
import { UiRules } from './ui-rules';

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

  test('чистая фикстура Ф2: нарушений нет, отчёт пуст, код 0', () => {
    const app = UiScene.fixture();

    const report = ArchReport.of(app);

    expect(ArchChecker.of(app).check()).toEqual([]);
    expect(report.code).toBe(0);
    expect(report.lines).toEqual([
      'arch:check example: нарушений — 0',
      'arch:check: нарушений нет',
    ]);
  });
});
