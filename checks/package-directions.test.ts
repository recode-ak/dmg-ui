import { describe, expect, it } from 'bun:test';
import { resolve } from 'node:path';
import { PackageDirections } from './package-directions';
import { PackageManifest } from './package-manifest';
import { SourceFile, SourceTree } from './source-tree';

const ROOT = resolve(import.meta.dir, '..');

// Два пакета: b может ссылаться на a, a — ни на кого.
const directions = () =>
  new PackageDirections(
    { a: [], b: ['a'] },
    { 'dmg-ui': 'a', 'dmg-ui/b': 'b' },
    { 'dmg-ui': 'packages/a/src', 'dmg-ui/b': 'packages/b/src' },
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
        "export const x = 1;\nimport '../../b/src/x';",
      );
      expect(found).toMatchObject([{ file: 'packages/a/src/f.ts', line: 2 }]);
    });

    it('относительный путь за пределы packages/', () => {
      expect(
        scanIn('packages/a/src/f.ts', "import '../../../x';"),
      ).toHaveLength(1);
    });

    it('вход из собственного каталога-цели: dmg-ui из packages/a/src', () => {
      expect(scanIn('packages/a/src/f.ts', "import 'dmg-ui';")).toHaveLength(1);
    });

    it('вход из собственного каталога-цели: dmg-ui/b из packages/b/src', () => {
      expect(scanIn('packages/b/src/f.ts', "import 'dmg-ui/b';")).toHaveLength(
        1,
      );
    });

    it('свой вход из другого каталога пакета разрешён', () => {
      expect(scanIn('packages/a/testing/f.ts', "import 'dmg-ui';")).toEqual([]);
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

    it('шаблон без интерполяции в import() проверяется', () => {
      const found = scanIn(
        'packages/a/src/f.ts',
        'const m = await import(`dmg-ui/b`);',
      );
      expect(found).toHaveLength(1);
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

  describe('таблица репо', () => {
    const standard = () =>
      PackageDirections.standard(PackageManifest.read(ROOT));
    const scanRepo = (path: string, text: string) =>
      standard().scan([SourceFile.of(path, text)]);

    for (const [path, spec] of [
      ['packages/chat-ui/src/dialog/f.ts', 'dmg-ui'],
      ['packages/chat-ui/src/dialog/f.ts', 'dmg-ui/graph'],
      ['packages/chat-ui/src/dialog/f.ts', 'dmg-ui/server'],
      ['packages/chat-ui/testing/f.ts', 'dmg-ui/testing'],
      ['packages/chat-ui/testing/f.ts', 'dmg-ui/chat-ui'],
      ['packages/tg-bot/src/f.ts', 'dmg-ui'],
      ['packages/tg-bot/src/f.ts', 'dmg-ui/server'],
      ['packages/tg-bot/src/f.ts', 'dmg-ui/chat-ui'],
    ] as const) {
      it(`${path} → «${spec}» разрешено`, () => {
        expect(scanRepo(path, `import '${spec}';`)).toEqual([]);
      });
    }

    for (const [path, spec, why] of [
      ['packages/core/src/f.ts', 'dmg-ui/chat-ui', 'ядро → chat-ui'],
      ['packages/core/src/f.ts', 'dmg-ui/tg-bot', 'ядро → tg-bot'],
      ['packages/core/testing/f.ts', 'dmg-ui/chat-ui', 'тесты ядра → chat-ui'],
      [
        'packages/core/testing/f.ts',
        'dmg-ui/chat-ui/testing',
        'тесты ядра → chat-ui/testing',
      ],
      ['packages/chat-ui/src/dialog/f.ts', 'dmg-ui/tg-bot', 'chat-ui → tg-bot'],
      [
        'packages/chat-ui/src/dialog/f.ts',
        '../../../core/src/x',
        'chat-ui → src ядра по относительному пути',
      ],
      [
        'packages/chat-ui/src/dialog/f.ts',
        'dmg-ui/packages/core/src/x',
        'chat-ui → вглубь ядра',
      ],
      [
        'packages/chat-ui/src/dialog/f.ts',
        'dmg-ui/chat-ui',
        'chat-ui/src → свой вход из своего каталога',
      ],
    ] as const) {
      it(`${why} — нарушение`, () => {
        const found = scanRepo(path, `import '${spec}';`);
        expect(found).toMatchObject([{ file: path, line: 1 }]);
      });
    }

    it('пакет вне таблицы репо — «обнови таблицу»', () => {
      const found = scanRepo('packages/unknown/src/f.ts', 'export {};');
      expect(found).toHaveLength(1);
      expect(found[0]?.text).toContain('таблиц');
    });
  });

  it('на реальном репо — ноль нарушений', () => {
    const standard = PackageDirections.standard(PackageManifest.read(ROOT));
    expect(standard.scan(SourceTree.read(ROOT, 'packages'))).toEqual([]);
  });
});
