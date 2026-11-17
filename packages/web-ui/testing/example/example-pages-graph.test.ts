import { describe, expect, test } from 'bun:test';
import { ArchChecker } from 'dmg-core/arch';
import { AppGraph } from 'dmg-core/graph';
import { ArchReport } from 'dmg-ui/testing/fixtures';
import { ExamplePagesArch } from './example-pages.arch';

// Привязка примера к страничному каналу: граф `examplePages` проходит
// `arch:check` без нарушений.

describe('ExamplePagesArch', () => {
  test('reportArchCheck — код 0 и итоговые строки без нарушений', () => {
    const report = ArchReport.of(ExamplePagesArch);

    expect(report.code).toBe(0);
    expect(report.lines).toEqual([
      'arch:check example: нарушений — 0',
      'arch:check: нарушений нет',
    ]);
  });

  test('ArchChecker не находит нарушений', () => {
    expect(ArchChecker.of(ExamplePagesArch).check()).toEqual([]);
  });

  test('в графе нет узлов приложения диалога', () => {
    const ids = new AppGraph(ExamplePagesArch)
      .build()
      .nodes()
      .map((node) => node.id);

    expect(ids).toContain('examplePages');
    expect(ids).not.toContain('exampleStub');
  });
});
