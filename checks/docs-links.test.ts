import { describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { useTempDir } from 'dmg-core/testing';
import { DocsLinkChecker } from './docs-links';
import { SourceFile } from './source-tree';
import { TextTree } from './text-tree';

const ROOT = resolve(import.meta.dir, '..');
const tmp = useTempDir('docs-links-');

const REQUIRED = [
  'docs/guides/story-screen-notification.md',
  'docs/guides/channel-package.md',
  'docs/guides/messenger-package.md',
  'docs/guides/telegram.md',
  'docs/reference/rules.md',
  'docs/decisions.md',
  'examples/tg-bot/README.md',
  'llms.txt',
  'debt.md',
];

/** Временный репо с файлами и проверка документа `doc.md` (путь `docs/doc.md`). */
const checkIn = (files: Record<string, string>, text: string) => {
  const dir = tmp();
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(dir.file(path)), { recursive: true });
    writeFileSync(dir.file(path), content);
  }
  return new DocsLinkChecker(dir.path).check([
    SourceFile.of('docs/doc.md', text),
  ]);
};

describe('DocsLinkChecker — относительные ссылки', () => {
  it('ссылка на существующий файл проходит', () => {
    expect(checkIn({ 'docs/other.md': '# Х' }, '[x](other.md)')).toEqual([]);
  });

  it('ссылка на каталог проходит', () => {
    expect(checkIn({ 'packages/a/f.ts': '' }, '[x](../packages/a/)')).toEqual(
      [],
    );
  });

  it('ссылка на несуществующий файл — нарушение с файлом и строкой', () => {
    const found = checkIn({}, 'a\n[x](missing.md)');
    expect(found).toEqual([
      { file: 'docs/doc.md', line: 2, text: 'missing.md: файл не найден' },
    ]);
  });

  it('якорь на существующий заголовок проходит', () => {
    const files = { 'docs/other.md': '# Один\n\n## Два слова, с знаками!\n' };
    expect(checkIn(files, '[x](other.md#два-слова-с-знаками)')).toEqual([]);
  });

  it('якорь на несуществующий заголовок — нарушение', () => {
    const found = checkIn({ 'docs/other.md': '# Один' }, '[x](other.md#нет)');
    expect(found.map((v) => v.text)).toEqual(['other.md#нет: якорь не найден']);
  });

  it('якорь внутри своего файла проверяется', () => {
    const dir = tmp();
    mkdirSync(dir.file('docs'), { recursive: true });
    writeFileSync(dir.file('docs/doc.md'), '# Свой\n');
    const checker = new DocsLinkChecker(dir.path);
    const doc = (text: string) => [SourceFile.of('docs/doc.md', text)];
    expect(checker.check(doc('# Свой\n[x](#свой)'))).toEqual([]);
    expect(checker.check(doc('# Свой\n[x](#чужой)'))).toHaveLength(1);
  });

  it('повторяющийся заголовок получает суффикс -1', () => {
    const files = { 'docs/other.md': '## Тема\n## Тема\n' };
    expect(checkIn(files, '[x](other.md#тема-1)')).toEqual([]);
  });

  it('заголовок в блоке кода не считается якорем', () => {
    const files = { 'docs/other.md': '```\n# Не заголовок\n```\n' };
    expect(checkIn(files, '[x](other.md#не-заголовок)')).toHaveLength(1);
  });

  it('ссылка в блоке кода не проверяется', () => {
    expect(checkIn({}, '```\n[x](missing.md)\n```')).toEqual([]);
  });

  it('http(s) и node_modules не проверяются', () => {
    expect(
      checkIn(
        {},
        '[a](https://x.dev/a) [b](http://x.dev) [c](node_modules/dmg-core/docs/a.md) [d](../node_modules/dmg-core/docs/a.md#z)',
      ),
    ).toEqual([]);
  });

  it('несколько ссылок в строке — нарушение на каждую битую', () => {
    const found = checkIn(
      { 'docs/ok.md': '' },
      '[a](ok.md) [b](x.md) [c](y.md)',
    );
    expect(found).toHaveLength(2);
  });

  it('путь вне репо — нарушение', () => {
    expect(checkIn({}, '[x](../../outside.md)')).toHaveLength(1);
  });
});

describe('документы репо', () => {
  for (const path of REQUIRED) {
    it(`существует ${path}`, () => {
      expect(existsSync(resolve(ROOT, path))).toBe(true);
    });
  }

  it('относительные ссылки README, docs, llms.txt, debt.md ведут на существующее', () => {
    const files = [
      ...['README.md', 'llms.txt', 'debt.md'].flatMap((path) => {
        const file = TextTree.file(ROOT, path);
        return file ? [file] : [];
      }),
      ...TextTree.read(ROOT, 'docs', ['.md']),
      ...TextTree.read(ROOT, 'examples', ['.md']),
    ];
    const found = new DocsLinkChecker(ROOT).check(files);
    expect(found.map((v) => `${v.file}:${v.line} ${v.text}`)).toEqual([]);
  });
});
