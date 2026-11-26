import { describe, expect, it } from 'bun:test';
import { resolve } from 'node:path';
import { SourceFile } from './source-tree';
import { TextTree } from './text-tree';
import { TrackReferenceScanner } from './track-references';

const ROOT = resolve(import.meta.dir, '..');
const SELF = ['checks/track-references.test.ts', 'checks/track-references.ts'];

const code = (text: string) =>
  new TrackReferenceScanner().scanCode([SourceFile.of('a.ts', text)]);
const doc = (text: string) =>
  new TrackReferenceScanner().scanDocuments([SourceFile.of('a.md', text)]);

describe('TrackReferenceScanner — шаблоны трека', () => {
  // [текст, найденный фрагмент]: для «брифа», «аудит Ф3», «ревью Ф5» шаблон ловит начало.
  const forbidden: [string, string][] = [
    ['Т-14', 'Т-14'],
    ['С-4', 'С-4'],
    ['ФР-7', 'ФР-7'],
    ['П-9', 'П-9'],
    ['бриф', 'бриф'],
    ['Бриф', 'Бриф'],
    ['брифа', 'бриф'],
    ['Ф6', 'Ф6'],
    ['фаза 3', 'фаза 3'],
    ['фазы 12', 'фазы 12'],
    ['критерий 9', 'критерий 9'],
    ['критерия 9', 'критерия 9'],
    ['расхождение 1', 'расхождение 1'],
    ['расхождения 4', 'расхождения 4'],
    ['аудит Ф3', 'аудит Ф'],
    ['аудита №2', 'аудита №'],
    ['ревью Ф5', 'ревью Ф'],
    ['design §4', 'design §4'],
    ['Design §12', 'Design §12'],
  ];

  for (const [phrase, fragment] of forbidden) {
    it(`«${phrase}» даёт нарушение с файлом, строкой и фрагментом`, () => {
      const found = code(`const a = 1;\n// см. ${phrase} тут\n`);
      expect(found).toEqual([{ file: 'a.ts', line: 2, text: fragment }]);
    });
  }

  it('несколько совпадений в строке — по нарушению на каждое', () => {
    expect(code('// Т-3 и Т-7').map((v) => v.text)).toEqual(['Т-3', 'Т-7']);
  });

  for (const clean of [
    'TST-04',
    'UTC-8',
    'D-UI-33',
    'UI-14',
    'Ф без номера',
    'ФТ6',
    'ТП-9',
    'П без номера',
    'фаза без номера',
    'фазы работы',
    'эфир',
    'описание правила',
    'design',
    'design системы',
  ]) {
    it(`чистый текст «${clean}» не срабатывает`, () => {
      expect(code(`// ${clean}`)).toEqual([]);
    });
  }

  it('conductor/ и u7-school в коде допустимы', () => {
    expect(code('// conductor/ u7-school')).toEqual([]);
  });

  it('в документах conductor/ и u7-school запрещены', () => {
    expect(
      doc('x\nсм. conductor/tracks и u7-school').map((v) => v.text),
    ).toEqual(['conductor/', 'u7-school']);
  });

  it('документы тоже проверяются на шаблоны трека', () => {
    expect(doc('решает Т-2')).toHaveLength(1);
  });

  it('чистый документ проходит', () => {
    expect(doc('# Заголовок\n\nИсход ведёт на экран, см. D-UI-12.')).toEqual(
      [],
    );
  });
});

describe('ссылки на трек в репо', () => {
  const notSelf = (files: SourceFile[]) =>
    files.filter((file) => !SELF.includes(file.path));
  const format = (found: { file: string; line: number; text: string }[]) =>
    found.map((v) => `${v.file}:${v.line} ${v.text}`);

  it('в packages/**, checks/** и acceptance/** нет ссылок на трек', () => {
    const files = notSelf([
      ...TextTree.read(ROOT, 'packages', ['.ts', '.snap']),
      ...TextTree.read(ROOT, 'checks', ['.ts', '.snap']),
      ...TextTree.read(ROOT, 'acceptance', ['.ts', '.snap']),
    ]);
    expect(format(new TrackReferenceScanner().scanCode(files))).toEqual([]);
  });

  it('в README, docs, agents, skills, llms.txt, debt.md нет ссылок на трек, conductor/ и u7-school', () => {
    const files = [
      ...['README.md', 'llms.txt', 'debt.md'].flatMap((path) => {
        const file = TextTree.file(ROOT, path);
        return file ? [file] : [];
      }),
      ...TextTree.read(ROOT, 'docs', ['.md']),
      ...TextTree.read(ROOT, 'agents', ['.md']),
      ...TextTree.read(ROOT, 'skills', ['.md']),
      ...TextTree.read(ROOT, 'packages/example', ['.md']),
    ];
    expect(format(new TrackReferenceScanner().scanDocuments(files))).toEqual(
      [],
    );
  });

  it('README.md не отсылает к номеру фазы чужого трека', () => {
    const readme = TextTree.file(ROOT, 'README.md');
    expect(readme).toBeDefined();
    expect(readme?.text).not.toMatch(/Фазе? \d+/);
  });
});
