import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ExampleZoneScanner } from './example-zone-scanner';
import { SourceFile, SourceTree } from './source-tree';

// Зона примера (`examples/tg-bot`): библиотека Telegram видна только двум файлам
// адаптера, а пример берёт соседей только по именам входов. Название библиотеки
// и её подпути в фикстурах собраны из частей: иначе сам тест нарушил бы правило
// при проверке `checks/` на реальном репо. Спецификатор подставляется через
// шаблон — поиск по тексту его не видит.

const ROOT = resolve(import.meta.dir, '..');
const LIB = ['gram', 'my'].join('');
const LIB_TYPES = ['@', LIB, 'js/types'].join('');
const EXAMPLE = 'examples/tg-bot/src';

const importFrom = (specifier: string): string =>
  `export const a = 1;\nimport { x } from '${specifier}';\n`;

const scan = (path: string, text: string) =>
  new ExampleZoneScanner().scan([SourceFile.of(path, text)]);

describe('ExampleZoneScanner — библиотека Telegram вне примера', () => {
  const places = [
    'packages/tg-bot/src/x.ts',
    'packages/chat-ui/testing/x.ts',
    'packages/core/src/x.ts',
    'checks/x.ts',
    'acceptance/x.ts',
  ];
  const specifiers = [LIB, `${LIB}/web`, LIB_TYPES];

  for (const path of places) {
    for (const specifier of specifiers) {
      test(`«${specifier}» в ${path} — нарушение`, () => {
        const found = scan(path, importFrom(specifier));
        expect(found).toHaveLength(1);
        expect(found[0]).toMatchObject({ file: path, line: 2 });
        expect(found[0]?.text).toContain(specifier);
      });
    }
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

describe('ExampleZoneScanner — внутри examples/tg-bot/src/', () => {
  for (const name of [
    'grammy-bot-api.ts',
    'grammy-bot-api.test.ts',
    'grammy-polling.ts',
    'grammy-polling.test.ts',
  ]) {
    test(`${name} — библиотека разрешена`, () => {
      for (const specifier of [LIB, `${LIB}/web`, LIB_TYPES]) {
        expect(scan(`${EXAMPLE}/${name}`, importFrom(specifier))).toEqual([]);
      }
    });
  }

  for (const name of [
    'example-bot.ts',
    'main.ts',
    'example-env.ts',
    'tracing-bot-api.ts',
    'example-bot.test.ts',
  ]) {
    test(`${name} — библиотека запрещена`, () => {
      const found = scan(`${EXAMPLE}/${name}`, importFrom(LIB));
      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({ file: `${EXAMPLE}/${name}`, line: 2 });
    });
  }
});

describe('ExampleZoneScanner — пример не выходит из своего каталога', () => {
  const escapes = [
    '../../../packages/tg-bot/src/index',
    '../../..',
    '../../../checks/source-tree',
    '../../other/x',
  ];
  for (const specifier of escapes) {
    test(`относительный «${specifier}» — нарушение`, () => {
      const found = scan(`${EXAMPLE}/main.ts`, importFrom(specifier));
      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({ file: `${EXAMPLE}/main.ts`, line: 2 });
      expect(found[0]?.text).toContain(specifier);
    });
  }

  test('выход из тестового файла примера — нарушение', () => {
    const found = scan(
      `${EXAMPLE}/example-bot.test.ts`,
      importFrom('../../../packages/tg-bot/src/index'),
    );
    expect(found).toHaveLength(1);
  });

  for (const specifier of [
    'dmg-ui/tg-bot',
    'dmg-ui/chat-ui/testing',
    './example-env',
    '../README',
    '../.trace/x',
    'dmg-core/testing/example',
  ]) {
    test(`«${specifier}» — чисто`, () => {
      expect(scan(`${EXAMPLE}/main.ts`, importFrom(specifier))).toEqual([]);
    });
  }

  test('относительный выход вне examples/ этим сканером не проверяется', () => {
    expect(
      scan('packages/tg-bot/src/x.ts', importFrom('../../chat-ui/src/index')),
    ).toEqual([]);
  });
});

describe('ExampleZoneScanner — реальный репо', () => {
  test('на реальном репо — ноль нарушений', () => {
    // `examples/` и `scripts/` могут отсутствовать или не содержать `.ts`.
    const dirs = ['packages', 'checks', 'acceptance', 'examples', 'scripts'];
    const files = dirs
      .filter((dir) => existsSync(resolve(ROOT, dir)))
      .flatMap((dir) => SourceTree.read(ROOT, dir));
    expect(files.length).toBeGreaterThan(0);
    expect(new ExampleZoneScanner().scan(files)).toEqual([]);
  });
});
