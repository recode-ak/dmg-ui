import { describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PackageDirections } from './package-directions';
import { PackageManifest } from './package-manifest';
import { SourceFile, SourceTree } from './source-tree';

const ROOT = resolve(import.meta.dir, '..');

// Два пакета: b может ссылаться на a, a — ни на кого.
const directions = () =>
  new PackageDirections(
    { a: [], b: ['a'] },
    { 'dmg-ui': 'a', 'dmg-ui/b': 'b' },
  );

const scanIn = (path: string, text: string) =>
  directions().scan([SourceFile.of(path, text)]);

describe('PackageDirections — направления между пакетами', () => {
  describe('разрешено', () => {
    it('внутрипакетный ./x проходит', () => {
      expect(scanIn('packages/a/src/f.ts', "import './x';")).toEqual([]);
    });

    it('относительный путь внутри каталога пакета проходит', () => {
      expect(scanIn('packages/a/src/sub/f.ts', "import '../x';")).toEqual([]);
    });

    it('вход соседа по имени, на который есть направление, проходит', () => {
      expect(scanIn('packages/b/src/f.ts', "import 'dmg-ui';")).toEqual([]);
    });

    it('сторонний пакет не проверяется', () => {
      expect(scanIn('packages/a/src/f.ts', "import 'valibot';")).toEqual([]);
    });
  });

  describe('нарушения', () => {
    it('относительный путь, выходящий из каталога пакета', () => {
      const found = scanIn(
        'packages/a/src/f.ts',
        "export const x = 1;\nimport '../../../b/src/x';",
      );
      expect(found).toMatchObject([{ file: 'packages/a/src/f.ts', line: 2 }]);
    });

    it('путь вглубь чужого пакета dmg-ui/packages/…', () => {
      const found = scanIn(
        'packages/b/src/f.ts',
        "import 'dmg-ui/packages/a/src/x';",
      );
      expect(found).toMatchObject([{ file: 'packages/b/src/f.ts', line: 1 }]);
    });

    it('путь вглубь dmg-ui/src/…', () => {
      const found = scanIn('packages/b/src/f.ts', "import 'dmg-ui/src/x';");
      expect(found).toHaveLength(1);
    });

    it('вход пакета, на который нет направления', () => {
      const found = scanIn('packages/a/src/f.ts', "import 'dmg-ui/b';");
      expect(found).toMatchObject([{ file: 'packages/a/src/f.ts', line: 1 }]);
    });

    it('export from и динамический import тоже проверяются', () => {
      const found = directions().scan([
        SourceFile.of(
          'packages/a/src/f.ts',
          "export * from 'dmg-ui/b';\nconst m = await import('dmg-ui/b');",
        ),
      ]);
      expect(found.map((v) => v.line)).toEqual([1, 2]);
    });

    it('пакет вне таблицы — «обнови таблицу»', () => {
      const found = scanIn('packages/c/src/f.ts', 'export const x = 1;');
      expect(found).toHaveLength(1);
      expect(found[0]?.file).toBe('packages/c/src/f.ts');
      expect(found[0]?.text).toContain('таблиц');
    });
  });

  describe('таблица из манифеста', () => {
    it('standard строит входы из exports корня', () => {
      const manifest = PackageManifest.parse(
        JSON.stringify({
          name: 'dmg-ui',
          exports: { '.': './packages/core/src/index.ts' },
        }),
      );
      const standard = PackageDirections.standard(manifest);
      const found = standard.scan([
        SourceFile.of('packages/core/src/f.ts', "import 'dmg-ui/tg-bot';"),
      ]);
      expect(found).toHaveLength(1);
    });
  });

  it('пакет на диске находится тем же кодом чтения, что у packages', () => {
    const dir = mkdtempSync(join(tmpdir(), 'directions-'));
    try {
      mkdirSync(join(dir, 'packages/a/src'), { recursive: true });
      writeFileSync(join(dir, 'packages/a/src/f.ts'), "import 'dmg-ui/b';\n");
      const files = SourceTree.read(dir, 'packages');
      expect(directions().scan(files)).toMatchObject([
        { file: 'packages/a/src/f.ts', line: 1 },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('на реальном репо — ноль нарушений', () => {
    const standard = PackageDirections.standard(PackageManifest.read(ROOT));
    expect(standard.scan(SourceTree.read(ROOT, 'packages'))).toEqual([]);
  });
});
