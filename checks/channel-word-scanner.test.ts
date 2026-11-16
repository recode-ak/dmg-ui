import { describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ChannelWordScanner } from './channel-word-scanner';
import { SourceFile, SourceTree } from './source-tree';

const ROOT = resolve(import.meta.dir, '..');
const CORE_SRC = 'packages/core/src';

const scan = (text: string, path = `${CORE_SRC}/a.ts`) =>
  new ChannelWordScanner().scan([SourceFile.of(path, text)]);

describe('ChannelWordScanner — в ядре нет слов канала', () => {
  const forbidden = [
    'сообщение',
    'сообщения',
    'кнопка',
    'кнопки',
    'button',
    'страница',
    'страницу',
    'page',
    'url',
    'uri',
    'href',
    'http',
    'https',
    'webhook',
    'deeplink',
    'telegram',
    'телеграм',
    'slack',
    'whatsapp',
    'discord',
    'tg',
    'chat',
    'чат',
    'чата',
    'бот',
    'бота',
    'боте',
  ];

  for (const word of forbidden) {
    it(`слово «${word}» даёт нарушение с файлом и строкой`, () => {
      const found = scan(`export const a = 1;\n// ${word} тут\n`);
      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({
        file: `${CORE_SRC}/a.ts`,
        line: 2,
      });
      expect(found[0]?.text).toContain(word);
    });
  }

  it('регистр не важен', () => {
    expect(scan('const a = "TELEGRAM";')).toHaveLength(1);
  });

  it('слово внутри camelCase находится', () => {
    expect(scan('const sendButton = 1;')).toHaveLength(1);
  });

  it('слово внутри snake_case находится', () => {
    expect(scan('const chat_id = 1;')).toHaveLength(1);
  });

  it('слово внутри kebab-case в строке находится', () => {
    expect(scan("const a = 'my-page-id';")).toHaveLength(1);
  });

  it('слово в строковом литерале срабатывает', () => {
    expect(scan("const a = 'нажми кнопку';")).toHaveLength(1);
  });

  it('слово в комментарии срабатывает', () => {
    expect(scan('/** Открывает страницу. */')).toHaveLength(1);
  });

  it('слово в тестовом файле ядра срабатывает', () => {
    expect(scan('// бот', `${CORE_SRC}/a.test.ts`)).toHaveLength(1);
  });

  it('несколько строк — по нарушению на строку с номерами', () => {
    const found = scan('// ok\n// url\n// ok\n// href\n');
    expect(found.map((v) => v.line)).toEqual([2, 4]);
  });

  for (const neutral of [
    'работа',
    'робот',
    'curl',
    'ссылка на Def',
    'link',
    'message',
    'callback',
    'web',
    'браузер',
  ]) {
    it(`нейтральный текст «${neutral}» не срабатывает`, () => {
      expect(scan(`// ${neutral}`)).toEqual([]);
    });
  }

  it('файл с кнопкой на диске находится тем же кодом чтения, что у src', () => {
    const dir = mkdtempSync(join(tmpdir(), 'channel-words-'));
    try {
      mkdirSync(join(dir, CORE_SRC), { recursive: true });
      writeFileSync(join(dir, CORE_SRC, 'x.ts'), '// кнопка\n');
      const files = SourceTree.read(dir, CORE_SRC);
      expect(new ChannelWordScanner().scan(files)).toMatchObject([
        { file: `${CORE_SRC}/x.ts`, line: 1 },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('на реальном packages/core/src — ноль нарушений', () => {
    const files = SourceTree.read(ROOT, CORE_SRC);
    expect(new ChannelWordScanner().scan(files)).toEqual([]);
  });
});
