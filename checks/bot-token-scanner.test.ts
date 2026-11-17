import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { BotTokenScanner } from './bot-token-scanner';
import { SourceFile } from './source-tree';
import { TextTree } from './text-tree';

// Токен BotFather: 8–10 цифр, двоеточие, 35 знаков. Тестовый «токен» собирается
// из частей в коде: в тексте этого файла готового токена нет, поэтому сканер
// на реальном репо его здесь не находит.

const ROOT = resolve(import.meta.dir, '..');
const fakeToken = (): string =>
  [['1234', '567890'].join(''), 'A'.repeat(35)].join(':');

const scan = (path: string, text: string) =>
  new BotTokenScanner().scan([SourceFile.of(path, text)]);

describe('BotTokenScanner — токен в текстовых файлах', () => {
  for (const path of [
    'packages/x/a.ts',
    'docs/a.md',
    'examples/tg-bot/a.json',
    'examples/tg-bot/.env.example',
    'packages/x/__snapshots__/a.test.ts.snap',
  ]) {
    test(`токен по форме в ${path} — нарушение без самого токена в тексте`, () => {
      const found = scan(
        path,
        `первая строка\nEXAMPLE_TG_TOKEN=${fakeToken()}\n`,
      );
      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({ file: path, line: 2 });
      expect(found[0]?.text).not.toContain(fakeToken());
    });
  }

  test('токен в кавычках и в середине строки — нарушение', () => {
    expect(scan('a.ts', `const t = "${fakeToken()}";`)).toHaveLength(1);
  });

  test('два токена — два нарушения', () => {
    expect(scan('a.md', `${fakeToken()}\n${fakeToken()}\n`)).toHaveLength(2);
  });

  for (const [name, text] of [
    ['пустое значение переменной', 'EXAMPLE_TG_TOKEN=\n'],
    ['тестовый токен адаптера', "new Api('test-token');"],
    ['цифры без хвоста', 'id 1234567890:abc'],
    ['слишком короткий хвост', `1234567890:${'A'.repeat(34)} x`],
    ['слишком короткий числовой префикс', `1234567:${'A'.repeat(35)}`],
  ] as const) {
    test(`${name} — чисто`, () => {
      expect(scan('a.md', text)).toEqual([]);
    });
  }
});

describe('BotTokenScanner — .gitignore', () => {
  test('.gitignore с .env — чисто', () => {
    const file = SourceFile.of('.gitignore', 'node_modules\n.env\n');
    expect(new BotTokenScanner().scanGitignore(file)).toEqual([]);
  });

  test('.gitignore без .env — нарушение', () => {
    const file = SourceFile.of('.gitignore', 'node_modules\n');
    const found = new BotTokenScanner().scanGitignore(file);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ file: '.gitignore' });
    expect(found[0]?.text).toContain('.env');
  });

  test('.env.example в .gitignore не заменяет .env — нарушение', () => {
    const file = SourceFile.of('.gitignore', '.env.example\n');
    expect(new BotTokenScanner().scanGitignore(file)).toHaveLength(1);
  });

  test('нет .gitignore — нарушение', () => {
    expect(new BotTokenScanner().scanGitignore(undefined)).toHaveLength(1);
  });
});

describe('BotTokenScanner — реальный репо', () => {
  const exts = ['.ts', '.md', '.json', '.sh', '.example', '.snap'];
  const dirs = [
    'packages',
    'checks',
    'acceptance',
    'docs',
    'examples',
    'scripts',
  ];

  test('на реальном репо — ноль нарушений', () => {
    const files = [
      ...dirs.flatMap((dir) => TextTree.read(ROOT, dir, exts)),
      ...['README.md', 'llms.txt', 'debt.md'].flatMap((path) => {
        const file = TextTree.file(ROOT, path);
        return file ? [file] : [];
      }),
    ];
    expect(files.length).toBeGreaterThan(0);
    expect(new BotTokenScanner().scan(files)).toEqual([]);
  });

  test('.gitignore реального репо содержит .env', () => {
    const file = TextTree.file(ROOT, '.gitignore');
    expect(new BotTokenScanner().scanGitignore(file)).toEqual([]);
  });
});
