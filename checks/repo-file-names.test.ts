import { describe, expect, it } from 'bun:test';
import { resolve } from 'node:path';
import { UiFileNames, type UiNamesLayout } from 'dmg-ui/testing';
import { SourceTree } from './source-tree';
import type { Violation } from './violation.types';

// Гейт NM-01 (D-UI-112) на дереве репо: имена и раскладка файлов UI.
// Конфигурация — каталоги репо целиком, без исключений: набор ядра, каналы
// и примеры, остальной код и тесты. Имя и суффикс проверяются везде, место — в зонах.

const ROOT = resolve(import.meta.dir, '..');

const LAYOUT: UiNamesLayout = {
  sets: ['packages/core/testing/example'],
  channels: [
    'packages/chat-ui/testing',
    'packages/tg-bot/testing',
    'packages/web-ui/testing',
    'examples/web/src',
    'examples/tg-bot/src',
  ],
  others: [
    'acceptance',
    'browser',
    'checks',
    'packages/core/testing',
    'packages/core/src',
    'packages/chat-ui/src',
    'packages/tg-bot/src',
    'packages/web-ui/src',
  ],
  tests: ['packages', 'examples', 'acceptance', 'checks', 'browser'],
};

const format = (found: readonly Violation[]) =>
  found.map((v) => `${v.file}:${v.line} ${v.text}`);

describe('имена файлов UI в репо (NM-01)', () => {
  it('файлы набора, каналов, примеров и тесты репо названы по naming.md', () => {
    const dirs = new Set([
      ...LAYOUT.sets,
      ...(LAYOUT.channels ?? []),
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
