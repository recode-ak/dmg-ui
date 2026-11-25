import { describe, expect, it } from 'bun:test';
import { resolve } from 'node:path';
import { UiFileNames, type UiNamesLayout } from 'dmg-ui/testing';
import { SourceTree } from './source-tree';
import type { Violation } from './violation.types';

// Гейт NM-01 (D-UI-112, D-UI-119) на дереве репо: имена и раскладка файлов UI.
// Учебный проект — по зонам своей раскладки (описание, код и каналы модулей, kit,
// раннеры); остальной код — `others`, тесты всех каталогов — `tests`. Имя и суффикс
// проверяются везде, место — в зонах проекта.

const ROOT = resolve(import.meta.dir, '..');

/** Учебный проект: шаблоны `{m}` зон лежат под ним, `SourceTree` их не читает. */
const PROJECT = 'packages/example/src';

const LAYOUT: UiNamesLayout = {
  ui: `${PROJECT}/platform/ui`,
  logic: `${PROJECT}/frontend/{m}/logic`,
  channels: [
    `${PROJECT}/frontend/{m}/chat`,
    `${PROJECT}/frontend/{m}/telegram`,
    `${PROJECT}/frontend/{m}/web`,
  ],
  kits: [`${PROJECT}/frontend/telegram-kit`, `${PROJECT}/frontend/web-kit`],
  shells: [`${PROJECT}/runners`],
  others: [
    'acceptance',
    'browser',
    'checks',
    'packages/core/src',
    'packages/core/testing',
    'packages/chat-ui/src',
    'packages/chat-ui/testing',
    'packages/tg-bot/src',
    'packages/tg-bot/testing',
    'packages/web-ui/src',
    'packages/web-ui/testing',
  ],
  tests: ['packages', 'acceptance', 'checks', 'browser'],
};

const format = (found: readonly Violation[]) =>
  found.map((v) => `${v.file}:${v.line} ${v.text}`);

describe('имена файлов UI в репо (NM-01)', () => {
  it('учебный проект, код пакетов и тесты репо названы и разложены по naming.md', () => {
    const dirs = new Set([
      PROJECT,
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
