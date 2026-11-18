import { describe, expect, test } from 'bun:test';
import { join, resolve } from 'node:path';
import { ClientBundle } from './client-bundle';

// Сборка клиента под браузер и её запретные входы. Проверка — по метафайлу,
// а не по тексту вывода: `import 'node:fs'` под `target: 'browser'` собирается
// и заменяется пустым объектом (строки `node:` в выводе нет), он виден только
// в `imports` метафайла; `bun:` роняет сборку. Входы запрещены сегментами
// пути, а не полным путём: метафайл дописывает `../` до корня репо. Каталог
// `web-ui/src/url/` в сборке законен: клиент разбирает адрес. Красные
// фикстуры — виртуальные файлы `Bun.build({ files })`: в репо не пишется
// ничего.

const ROOT = resolve(import.meta.dir, '../../../..');

/** Метафайл без нарушений — основа синтетических сцен. */
const CLEAN = {
  inputs: [
    'examples/web/src/client/main.ts',
    'packages/web-ui/src/client/page-client.ts',
    'packages/web-ui/src/url/page-urls.ts',
    'packages/web-ui/src/wire/page-messages.ts',
    'packages/core/src/runtime/screen-runtime.ts',
    'node_modules/dmg-core/src/domain/contracts/use-case-def.ts',
    'examples/web/src/view/region-frame.ts',
  ],
  imports: ['valibot', 'dmg-core', './client/page-client', '../wire/x'],
  code: 'const id = crypto.randomUUID();',
};

describe('ClientBundle.violations — синтетический метафайл', () => {
  test('чистый метафайл — нарушений нет; каталог url/ законен', () => {
    expect(ClientBundle.violations(CLEAN)).toEqual([]);
  });

  const segments: [string, string][] = [
    ['dmg-core/src/app/', 'node_modules/dmg-core/src/app/api-app.ts'],
    ['dmg-core/src/arch/', 'node_modules/dmg-core/src/arch/arch-checker.ts'],
    ['dmg-core/src/graph/', 'node_modules/dmg-core/src/graph/app-graph.ts'],
    ['dmg-core/src/cli', 'node_modules/dmg-core/src/cli/main.ts'],
    ['dmg-core/src/gen', 'node_modules/dmg-core/src/gen/scaffold.ts'],
    ['core/src/server/', 'packages/core/src/server/ui-server.ts'],
    ['core/src/graph/', 'packages/core/src/graph/ui-graph-provider.ts'],
    ['web-ui/src/server/', 'packages/web-ui/src/server/page-host.ts'],
    ['web-ui/src/graph/', 'packages/web-ui/src/graph/page-graph-provider.ts'],
    ['examples/web/src/server/', 'examples/web/src/server/main.ts'],
  ];

  for (const [segment, input] of segments) {
    test(`вход с сегментом «${segment}» — нарушение`, () => {
      const found = ClientBundle.violations({
        ...CLEAN,
        inputs: [...CLEAN.inputs, input],
      });

      expect(found.length).toBeGreaterThan(0);
      expect(found.join('\n')).toContain(segment);
    });

    test(`тот же вход с ../ до корня репо — нарушение`, () => {
      const found = ClientBundle.violations({
        ...CLEAN,
        inputs: [...CLEAN.inputs, `../../../${input}`],
      });

      expect(found.length).toBeGreaterThan(0);
    });
  }

  for (const path of ['node:fs', 'node:path', 'bun:test', 'bun:sqlite']) {
    test(`импорт «${path}» в метафайле — нарушение`, () => {
      const found = ClientBundle.violations({
        ...CLEAN,
        imports: [...CLEAN.imports, path],
      });

      expect(found.length).toBeGreaterThan(0);
      expect(found.join('\n')).toContain(path);
    });
  }

  for (const code of [
    'Bun.serve({ port: 0 });',
    'const e = process.env.X;',
    'const m = require("x");',
  ]) {
    test(`вывод «${code}» — нарушение`, () => {
      expect(
        ClientBundle.violations({ ...CLEAN, code: `${CLEAN.code}\n${code}` })
          .length,
      ).toBeGreaterThan(0);
    });
  }

  test('несколько нарушений — каждое названо', () => {
    const found = ClientBundle.violations({
      inputs: ['packages/web-ui/src/server/page-host.ts'],
      imports: ['node:fs'],
      code: 'Bun.serve(x);',
    });

    expect(found.length).toBeGreaterThanOrEqual(3);
  });
});

/** Виртуальный вход внутри репо: ни один файл на диск не пишется. */
const virtual = (name: string, text: string) => {
  const entry = join(ROOT, 'examples/web/src', `__virtual_${name}.ts`);
  return { entry, files: { [entry]: text } };
};

describe('ClientBundle.build — виртуальные сборки', () => {
  test('чистый PageClient: сборка есть, нарушений нет, каталог url/ в сборке есть', async () => {
    const bundle = await ClientBundle.build(
      virtual(
        'good',
        "import { PageClient } from 'dmg-ui/web-ui'; export const e = PageClient;",
      ),
    );

    expect(ClientBundle.violations(bundle)).toEqual([]);
    expect(
      bundle.inputs.some((input) => input.includes('web-ui/src/url/')),
    ).toBe(true);
  });

  test("import 'node:fs' собирается, но виден в imports метафайла — нарушение", async () => {
    const bundle = await ClientBundle.build(
      virtual(
        'node',
        "import { readFileSync } from 'node:fs'; export const a = readFileSync;",
      ),
    );

    expect(bundle.imports).toContain('node:fs');
    expect(ClientBundle.violations(bundle).join('\n')).toContain('node:fs');
  });

  test("import 'bun:test' — сборка бросает", async () => {
    await expect(
      ClientBundle.build(
        virtual(
          'bun',
          "import { test } from 'bun:test'; export const d = test;",
        ),
      ),
    ).rejects.toBeDefined();
  });

  test("import 'dmg-core/app' — вход app/ виден, нарушение", async () => {
    const bundle = await ClientBundle.build(
      virtual(
        'app',
        "import { ConsoleLogger } from 'dmg-core/app'; export const b = ConsoleLogger;",
      ),
    );

    expect(
      bundle.inputs.some((input) => input.includes('dmg-core/src/app/')),
    ).toBe(true);
    expect(ClientBundle.violations(bundle).join('\n')).toContain(
      'dmg-core/src/app/',
    );
  });

  test('PageHost из dmg-ui/web-ui — входы web-ui/src/server/, нарушение', async () => {
    const bundle = await ClientBundle.build(
      virtual(
        'host',
        "import { PageHost } from 'dmg-ui/web-ui'; export const c = PageHost;",
      ),
    );

    expect(ClientBundle.violations(bundle).join('\n')).toContain(
      'web-ui/src/server/',
    );
  });
});

describe('ClientBundle.build — настоящий клиент', () => {
  test('сборка чистая: нарушений нет, один выход, вход клиента и каталог url/ в сборке', async () => {
    const bundle = await ClientBundle.build();

    expect(ClientBundle.violations(bundle)).toEqual([]);
    expect(bundle.outputs).toBe(1);
    expect(bundle.code.length).toBeGreaterThan(0);
    expect(
      bundle.inputs.some((input) =>
        input.endsWith('examples/web/src/client/main.ts'),
      ),
    ).toBe(true);
    expect(
      bundle.inputs.some((input) => input.includes('web-ui/src/url/')),
    ).toBe(true);
  });

  test('в метафайле нет node: и bun:, во выводе — Bun., process., require(', async () => {
    const bundle = await ClientBundle.build();

    expect(bundle.imports.filter((path) => /^(node|bun):/.test(path))).toEqual(
      [],
    );
    for (const word of ['Bun.', 'process.', 'require(']) {
      expect(bundle.code).not.toContain(word);
    }
  });

  test('ни одного серверного входа примера и пакетов', async () => {
    const bundle = await ClientBundle.build();

    for (const segment of [
      'examples/web/src/server/',
      'web-ui/src/server/',
      'web-ui/src/graph/',
      'core/src/server/',
      'core/src/graph/',
      'dmg-core/src/app/',
      'dmg-core/src/arch/',
      'dmg-core/src/graph/',
    ]) {
      expect(bundle.inputs.filter((input) => input.includes(segment))).toEqual(
        [],
      );
    }
  });
});
