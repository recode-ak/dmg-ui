import { describe, expect, it } from 'bun:test';
import { resolve } from 'node:path';
import { UiFileNames, type UiNamesLayout } from 'dmg-ui/testing';
import { SourceTree } from './source-tree';
import type { Violation } from './violation.types';

// Гейт NM-01 (D-UI-112) на дереве репо: имена и раскладка файлов UI.
// Конфигурация растёт по каталогам, а не копит исключения: каналы, примеры,
// `checks` и `browser` подключаются вместе со своими переименованиями.

const ROOT = resolve(import.meta.dir, '..');

const LAYOUT: UiNamesLayout = {
  sets: ['packages/core/testing/example'],
  others: ['acceptance/support'],
  tests: ['packages/core/src', 'packages/core/testing', 'acceptance'],
};

const format = (found: readonly Violation[]) =>
  found.map((v) => `${v.file}:${v.line} ${v.text}`);

describe('имена файлов UI в репо (NM-01)', () => {
  it('файлы набора, приёмки и тесты ядра названы по naming.md', () => {
    const dirs = new Set([
      ...LAYOUT.sets,
      ...(LAYOUT.others ?? []),
      ...(LAYOUT.tests ?? []),
    ]);
    const files = new Map<string, { path: string; text: string }>();
    for (const dir of dirs) {
      for (const f of SourceTree.read(ROOT, dir)) files.set(f.path, f);
    }

    const found = new UiFileNames(LAYOUT).check([...files.values()]);

    expect(format(found)).toEqual([]);
  });
});
