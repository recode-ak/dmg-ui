import { describe, expect, it } from 'bun:test';
import { resolve } from 'node:path';
import { CoreImportScanner } from './core-import-scanner';
import { SourceFile, SourceTree } from './source-tree';

// Имя библиотеки Telegram собрано из частей: строка-фикстура не должна читаться как импорт (ExampleZoneScanner).
const LIB = ['gram', 'my'].join('');

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
      ['require', "const fs = require('node:fs');"],
      ['шаблон без интерполяции', 'const m = await import(`node:fs`);'],
      ['dmg-ui/testing', "import { x } from 'dmg-ui/testing';"],
      [
        'относительный путь в testing ядра',
        "import { x } from '../testing/index';",
      ],
      ['сторонний пакет grammy', `import { Bot } from '${LIB}';`],
      ['сторонний пакет react', "import React from 'react';"],
      [
        'сторонний подпуть dmg-core/other',
        "import { x } from 'dmg-core/other';",
      ],
      ['динамический import', "const m = await import('node:fs');"],
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
    for (const spec of ['valibot', 'dmg-core', './x', '../y/z']) {
      it(`импорт «${spec}» проходит`, () => {
        expect(scan(`import { a } from '${spec}';`)).toEqual([]);
      });
    }

    for (const spec of ['dmg-core/graph', 'dmg-core/app', 'dmg-core/arch']) {
      it(`импорт «${spec}» в src вне graph/ — вне белого списка`, () => {
        expect(scan(`import { a } from '${spec}';`)).toHaveLength(1);
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

  describe('graph/ — отдельная зона', () => {
    const GRAPH = `${SRC}/graph/a.ts`;

    it('dmg-core/graph разрешён только в src/graph/', () => {
      expect(scan("import { Graph } from 'dmg-core/graph';", GRAPH)).toEqual(
        [],
      );
    });

    for (const spec of ['dmg-core/arch', 'dmg-core/app']) {
      it(`«${spec}» не разрешён и в graph/`, () => {
        expect(scan(`import { a } from '${spec}';`, GRAPH)).toHaveLength(1);
      });
    }

    for (const text of [
      "import fs from 'node:fs';",
      "import { test } from 'bun:test';",
      "import { x } from 'dmg-core/testing';",
      "import { x } from 'dmg-core/gen';",
      "import { x } from 'dmg-core/cli';",
      `import { x } from '${LIB}';`,
    ]) {
      it(`${text} в graph/ — нарушение`, () => {
        expect(scan(text, GRAPH)).toHaveLength(1);
      });
    }

    it('в graph/ разрешены valibot, dmg-core и относительные пути к соседям', () => {
      const text =
        "import * as v from 'valibot';\nimport { Def } from 'dmg-core';\nimport { a } from '../manifest/a';";

      expect(scan(text, GRAPH)).toEqual([]);
    });

    it('*.test.ts в graph/ может брать node: и bun:', () => {
      const text = "import { test } from 'bun:test';\nimport 'node:fs';";

      expect(scan(text, `${SRC}/graph/a.test.ts`)).toEqual([]);
    });

    it('файл вне graph/ не импортирует graph/ относительным путём', () => {
      expect(scan("import { a } from './graph/a';")).toHaveLength(1);
      expect(
        scan("import { a } from '../graph/index';", `${SRC}/screen/a.ts`),
      ).toHaveLength(1);
    });
  });

  describe('server/ — отдельная зона', () => {
    const SERVER = `${SRC}/server/a.ts`;

    for (const spec of ['dmg-core/app', 'dmg-core/graph']) {
      it(`«${spec}» разрешён в src/server/`, () => {
        expect(scan(`import { a } from '${spec}';`, SERVER)).toEqual([]);
      });
    }

    for (const text of [
      "import { a } from 'dmg-core/arch';",
      "import fs from 'node:fs';",
      "import { x } from 'dmg-core/testing';",
      "import { a } from '../graph/index';",
      "import { a } from '../../testing/example';",
    ]) {
      it(`${text} в server/ — нарушение`, () => {
        expect(scan(text, SERVER)).toHaveLength(1);
      });
    }

    it('в server/ разрешены соседи по src/ кроме graph/', () => {
      const text =
        "import { a } from '../runtime/a';\nimport { b } from '../manifest/b';";

      expect(scan(text, SERVER)).toEqual([]);
    });
  });

  describe('runtime/ — часть ядра', () => {
    const RUNTIME = `${SRC}/runtime/a.ts`;

    for (const spec of ['dmg-core/app', 'dmg-core/graph']) {
      it(`«${spec}» в runtime/ — вне белого списка`, () => {
        expect(scan(`import { a } from '${spec}';`, RUNTIME)).toHaveLength(1);
      });
    }

    for (const dir of ['server', 'graph']) {
      it(`runtime/ не импортирует ${dir}/ относительным путём`, () => {
        const text = `import { a } from '../${dir}/index';`;

        expect(scan(text, RUNTIME)).toHaveLength(1);
      });
    }

    it('файл ядра вне runtime/ не импортирует server/ относительным путём', () => {
      expect(
        scan("import { a } from '../server/index';", `${SRC}/screen/a.ts`),
      ).toHaveLength(1);
    });
  });

  describe('учебный пример — относительные только внутри example/', () => {
    it('заглушки тестов ядра (testing/ui-*.ts) в примере — нарушение', () => {
      const text = "import { RuntimeKit } from '../../ui-runtime-fixture';";

      expect(
        scan(text, 'packages/core/testing/example/todo/task-list.code.ts'),
      ).toHaveLength(1);
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

    const strict = new CoreImportScanner([
      {
        include: ['packages/a/'],
        exclude: [],
        forbidden: [],
        allowed: ['valibot'],
        forbiddenPaths: ['packages/a/testing'],
      },
    ]);

    it('белый список: вне списка — нарушение, из списка — нет', () => {
      const run = (spec: string) =>
        strict.scan([SourceFile.of('packages/a/x.ts', `import '${spec}';`)]);
      expect(run('react')).toHaveLength(1);
      expect(run('valibot')).toEqual([]);
      expect(run('./y')).toEqual([]);
    });

    const paths = new CoreImportScanner([
      {
        include: ['packages/a/'],
        exclude: [],
        forbidden: [],
        allowedPaths: ['packages/a/lib'],
      },
    ]);

    it('allowedPaths: относительный импорт вне белого списка путей — нарушение', () => {
      const run = (spec: string) =>
        paths.scan([SourceFile.of('packages/a/lib/x.ts', `import '${spec}';`)]);
      expect(run('./y')).toEqual([]);
      expect(run('../src/y')).toHaveLength(1);
      expect(run('react')).toEqual([]);
    });

    it('forbiddenPaths: путь разрешается от каталога файла', () => {
      const run = (path: string, spec: string) =>
        strict.scan([SourceFile.of(path, `import '${spec}';`)]);
      expect(run('packages/a/src/x.ts', '../testing/t')).toHaveLength(1);
      expect(run('packages/a/src/x.ts', '../lib/t')).toEqual([]);
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

  for (const dir of [
    'packages/core',
    'packages/chat-ui',
    'packages/tg-bot',
    'packages/web-ui',
    'acceptance',
  ]) {
    it(`на реальном ${dir} — ноль нарушений`, () => {
      const files = SourceTree.read(ROOT, dir);
      expect(files.length).toBeGreaterThan(0);
      expect(CoreImportScanner.standard().scan(files)).toEqual([]);
    });
  }
});

describe('CoreImportScanner — browser/ (клиент DevTools и раннер)', () => {
  const BROWSER = 'browser/browser-page.ts';

  it('node:, bun: и подпути dmg-ui разрешены', () => {
    const text = [
      "import { mkdtempSync } from 'node:fs';",
      "import { test } from 'bun:test';",
      "import { PageClient } from 'dmg-ui/web-ui';",
      "import { useTempDir } from 'dmg-core/testing';",
      "import { Chrome } from './chrome-process';",
    ].join('\n');

    expect(scan(text, BROWSER)).toEqual([]);
  });

  it('относительный импорт сервера примера разрешён', () => {
    const text =
      "import { ExampleWebServer } from '../examples/web/src/server/example-web-server';";

    expect(scan(text, BROWSER)).toEqual([]);
  });

  it('относительный импорт клиента примера — нарушение: DOM-код не нужен', () => {
    const text = "import { a } from '../examples/web/src/client/main';";

    expect(scan(text, BROWSER)).toHaveLength(1);
  });

  it('относительный импорт кода пакетов — нарушение: только публичные входы', () => {
    const text = "import { a } from '../packages/core/src/index';";

    expect(scan(text, BROWSER)).toHaveLength(1);
  });

  it('сторонний пакет — нарушение', () => {
    expect(scan("import React from 'react';", BROWSER)).toHaveLength(1);
  });

  it('на реальном browser — ноль нарушений', () => {
    const files = SourceTree.read(ROOT, 'browser');

    expect(files.length).toBeGreaterThan(0);
    expect(CoreImportScanner.standard().scan(files)).toEqual([]);
  });
});
