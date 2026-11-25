import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ExampleZoneScanner } from './example-zone-scanner';
import { SourceFile, SourceTree } from './source-tree';

// Учебный проект (`packages/example`): библиотека Telegram видна только файлам
// адаптера (`grammy-*.ts`) раннера `tg-bot`, абсолютных путей в импортах нет.
// Выход из проекта относительным путём держат `PackageDirections` (из пакета)
// и слои (из места). Реальный репо сканируется без `checks/`: фикстуры тестов
// называют библиотеку прямо.

const ROOT = resolve(import.meta.dir, '..');
const LIB = 'grammy';
const LIB_TYPES = '@grammyjs/types';
const EXAMPLE = 'packages/example/src/runners/tg-bot';

const importFrom = (specifier: string): string =>
  `export const a = 1;\nimport { x } from '${specifier}';\n`;

const scan = (path: string, text: string) =>
  new ExampleZoneScanner().scan([SourceFile.of(path, text)]);

describe('ExampleZoneScanner — библиотека Telegram вне примера', () => {
  const path = 'packages/tg-bot/src/x.ts';

  for (const specifier of [LIB, `${LIB}/web`, LIB_TYPES]) {
    test(`«${specifier}» в ${path} — нарушение`, () => {
      const found = scan(path, importFrom(specifier));
      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({ file: path, line: 2 });
      expect(found[0]?.text).toContain(specifier);
    });
  }

  test('динамический import() с литералом в packages — нарушение', () => {
    const found = scan(
      'packages/tg-bot/src/x.ts',
      `export const a = await import('${LIB}');\n`,
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      file: 'packages/tg-bot/src/x.ts',
      line: 1,
    });
  });

  test('файл без библиотеки в packages — чисто', () => {
    expect(scan('packages/tg-bot/src/x.ts', importFrom('valibot'))).toEqual([]);
  });
});

describe('ExampleZoneScanner — внутри раннера tg-bot учебного проекта', () => {
  for (const name of ['main.ts', 'tracing-bot-api.ts', 'example-bot.test.ts']) {
    test(`${name} — библиотека запрещена`, () => {
      const found = scan(`${EXAMPLE}/${name}`, importFrom(LIB));
      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({ file: `${EXAMPLE}/${name}`, line: 2 });
    });
  }
});

describe('ExampleZoneScanner — адаптеры библиотеки видны не всем', () => {
  for (const [name, specifier] of [
    ['example-bot.ts', './grammy-polling.ts'],
    ['example-probe.ts', './grammy-bot-api'],
    ['tracing-bot-api.ts', './grammy-bot-api'],
  ] as const) {
    test(`«${specifier}» из ${name} — нарушение`, () => {
      const found = scan(`${EXAMPLE}/${name}`, importFrom(specifier));
      expect(found).toHaveLength(1);
      expect(found[0]?.text).toContain(specifier);
    });
  }

  for (const name of [
    'probe.ts',
    'grammy-polling.ts',
    'grammy-polling.types.ts',
  ]) {
    test(`«./grammy-bot-api» из ${name} — чисто`, () => {
      expect(
        scan(`${EXAMPLE}/${name}`, importFrom('./grammy-bot-api')),
      ).toEqual([]);
    });
  }
});

describe('ExampleZoneScanner — адаптер определяется шаблоном grammy-*', () => {
  const adapterFiles = [
    'grammy-anything.ts',
    'grammy-anything.types.ts',
    'grammy-anything.test.ts',
  ];

  for (const name of adapterFiles) {
    test(`${name} — библиотека разрешена`, () => {
      expect(scan(`${EXAMPLE}/${name}`, importFrom(LIB))).toEqual([]);
    });
  }

  test('example-bot.ts — библиотека запрещена', () => {
    const found = scan(`${EXAMPLE}/example-bot.ts`, importFrom(LIB));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      file: `${EXAMPLE}/example-bot.ts`,
      line: 2,
    });
  });

  test('«./grammy-anything» из example-bot.ts — нарушение', () => {
    const found = scan(
      `${EXAMPLE}/example-bot.ts`,
      importFrom('./grammy-anything'),
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.text).toContain('./grammy-anything');
  });

  for (const name of ['main.ts', 'probe.ts', 'example-bot.test.ts']) {
    test(`«./grammy-anything» из ${name} — чисто`, () => {
      expect(
        scan(`${EXAMPLE}/${name}`, importFrom('./grammy-anything')),
      ).toEqual([]);
    });
  }
});

describe('ExampleZoneScanner — абсолютный путь в учебном проекте', () => {
  for (const path of [
    `${EXAMPLE}/main.ts`,
    `${EXAMPLE}/example-bot.test.ts`,
    'packages/example/src/runners/web/server/x.ts',
    'packages/example/src/frontend/todo/chat/x.ts',
  ]) {
    test(`абсолютный путь в ${path} — нарушение`, () => {
      const found = scan(
        path,
        importFrom('/home/x/dmg-ui/packages/tg-bot/src/index'),
      );
      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({ file: path, line: 2 });
    });
  }

  for (const specifier of [
    'dmg-ui/tg-bot',
    './example-env',
    '../README',
    '../../platform/ui',
  ]) {
    test(`«${specifier}» — чисто`, () => {
      expect(scan(`${EXAMPLE}/main.ts`, importFrom(specifier))).toEqual([]);
    });
  }

  test('файл grammy-* вне раннера tg-bot — библиотека запрещена', () => {
    const found = scan(
      'packages/example/src/runners/web/server/grammy-polling.ts',
      importFrom(LIB),
    );
    expect(found).toHaveLength(1);
  });

  test('относительные пути этим сканером не проверяются', () => {
    expect(
      scan(`${EXAMPLE}/main.ts`, importFrom('../../../../tg-bot/src/index')),
    ).toEqual([]);
  });
});

describe('ExampleZoneScanner — реальный репо', () => {
  test('main.ts и probe.ts существуют и без исключения берут адаптер — не фантомы', () => {
    const files = SourceTree.read(ROOT, EXAMPLE);

    for (const name of ['main.ts', 'probe.ts']) {
      const file = files.find((f) => f.path === `${EXAMPLE}/${name}`);
      expect(file).toBeDefined();
      const renamed = SourceFile.of(`${EXAMPLE}/renamed.ts`, file?.text ?? '');

      const found = new ExampleZoneScanner().scan([renamed]);

      expect(found).toHaveLength(1);
      expect(found[0]?.text).toContain('адаптер библиотеки');
    }
  });

  test('на реальном репо — ноль нарушений', () => {
    // `checks/` не сканируется: фикстуры её тестов называют библиотеку прямо.
    // `scripts/` может отсутствовать или не содержать `.ts`.
    const dirs = ['packages', 'acceptance', 'scripts'];
    const files = dirs
      .filter((dir) => existsSync(resolve(ROOT, dir)))
      .flatMap((dir) => SourceTree.read(ROOT, dir));
    expect(files.some((file) => file.path.startsWith('packages/'))).toBe(true);
    expect(files.some((file) => file.path.startsWith(`${EXAMPLE}/`))).toBe(
      true,
    );
    expect(new ExampleZoneScanner().scan(files)).toEqual([]);
  });
});
