import { describe, expect, test } from 'bun:test';
import { ArchChecker } from 'dmg-core/arch';
import { ArchReport } from 'dmg-ui/testing/fixtures';
import { ExampleWebArch } from './example-web.arch';

// Граф примера для браузера: домен учебного приложения, поставщик `dmg-ui` и
// поставщик страничного канала с маршрутами. Полноту сборки представлений на
// DOM держит её конструктор (`example-views.test.ts`), не граф.

describe('ExampleWebArch', () => {
  test('arch:check — код 0 и итоговые строки без нарушений', () => {
    const report = ArchReport.of(ExampleWebArch);

    expect(report.code).toBe(0);
    expect(report.lines).toEqual([
      'arch:check example: нарушений — 0',
      'arch:check: нарушений нет',
    ]);
  });

  test('ArchChecker не находит нарушений', () => {
    expect(ArchChecker.of(ExampleWebArch).check()).toEqual([]);
  });
});
