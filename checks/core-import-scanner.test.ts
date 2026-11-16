import { describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { CoreImportScanner } from './core-import-scanner';
import { SourceFile, SourceTree } from './source-tree';

const ROOT = resolve(import.meta.dir, '..');
const SRC = 'packages/core/src';

const scan = (text: string, path = `${SRC}/a.ts`) =>
  CoreImportScanner.standard().scan([SourceFile.of(path, text)]);

describe('CoreImportScanner — ядро не берёт node:, bun: и тестовые входы', () => {
  describe('запрещено в src (кроме *.test.ts)', () => {
    const forms: Array<[string, string]> = [
      ['import node:', "import { readFileSync } from 'node:fs';"],
      ['import bun:', "import { test } from 'bun:test';"],
      ['голый встроенный модуль fs', "import fs from 'fs';"],
      ['голый встроенный модуль path', "import { join } from 'path';"],
      ['import без привязок', "import 'node:process';"],
      ['require', "const fs = require('node:fs');"],
      ['require голого модуля', "const p = require('path');"],
      ['export from', "export { join } from 'node:path';"],
      ['export * from', "export * from 'bun:sqlite';"],
      ['динамический import', "const m = await import('node:fs');"],
      ['динамический import bun:', "const m = await import('bun:test');"],
      ['dmg-core/testing', "import { useTempDir } from 'dmg-core/testing';"],
      [
        'dmg-core/testing/*',
        "import { ExampleApp } from 'dmg-core/testing/example';",
      ],
      ['dmg-core/gen', "import { x } from 'dmg-core/gen';"],
      ['dmg-core/cli', "import { x } from 'dmg-core/cli';"],
    ];

    for (const [name, text] of forms) {
      it(`${name} — нарушение`, () => {
        const found = scan(`export const a = 1;\n${text}\n`);
        expect(found).toHaveLength(1);
        expect(found[0]).toMatchObject({ file: `${SRC}/a.ts`, line: 2 });
      });
    }
  });

  describe('разрешено', () => {
    for (const spec of [
      'valibot',
      'dmg-core',
      'dmg-core/graph',
      'dmg-core/app',
      'dmg-core/arch',
      './x',
      '../y/z',
    ]) {
      it(`импорт «${spec}» проходит`, () => {
        expect(scan(`import { a } from '${spec}';`)).toEqual([]);
      });
    }

    it('node: и bun: в *.test.ts ядра — без нарушений', () => {
      const text = "import { test } from 'bun:test';\nimport 'node:fs';";
      expect(scan(text, `${SRC}/a.test.ts`)).toEqual([]);
    });

    it('node: и dmg-core/testing в packages/core/testing — без нарушений', () => {
      const text =
        "import 'node:fs';\nimport { useTempDir } from 'dmg-core/testing';";
      expect(scan(text, 'packages/core/testing/a.ts')).toEqual([]);
    });
  });

  describe('набор зон', () => {
    const custom = new CoreImportScanner([
      {
        include: ['packages/a/'],
        exclude: ['.test.ts'],
        forbidden: ['node:*', 'dmg-core/app'],
      },
    ]);

    it('своя зона запрещает свои спецификаторы', () => {
      const found = custom.scan([
        SourceFile.of('packages/a/x.ts', "import 'dmg-core/app';"),
      ]);
      expect(found).toMatchObject([{ file: 'packages/a/x.ts', line: 1 }]);
    });

    it('своя зона не трогает спецификаторы вне списка', () => {
      const found = custom.scan([
        SourceFile.of('packages/a/x.ts', "import 'dmg-core/graph';"),
      ]);
      expect(found).toEqual([]);
    });

    it('файл вне всех зон не проверяется', () => {
      const found = custom.scan([
        SourceFile.of('packages/b/x.ts', "import 'node:fs';"),
      ]);
      expect(found).toEqual([]);
    });

    it('исключение зоны (*.test.ts) не проверяется', () => {
      const found = custom.scan([
        SourceFile.of('packages/a/x.test.ts', "import 'node:fs';"),
      ]);
      expect(found).toEqual([]);
    });
  });

  it('файл с node: на диске находится тем же кодом чтения, что у src', () => {
    const dir = mkdtempSync(join(tmpdir(), 'core-imports-'));
    try {
      mkdirSync(join(dir, SRC), { recursive: true });
      writeFileSync(join(dir, SRC, 'x.ts'), "import 'node:fs';\n");
      const files = SourceTree.read(dir, 'packages/core');
      expect(CoreImportScanner.standard().scan(files)).toMatchObject([
        { file: `${SRC}/x.ts`, line: 1 },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('на реальном packages/core — ноль нарушений', () => {
    const files = SourceTree.read(ROOT, 'packages/core');
    expect(CoreImportScanner.standard().scan(files)).toEqual([]);
  });
});
