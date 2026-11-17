import { describe, expect, it } from 'bun:test';
import { resolve } from 'node:path';
import { NetworkGlobalScanner } from './network-globals';
import { SourceFile, SourceTree } from './source-tree';
import type { Violation } from './violation.types';

// Глобалы сети и среды в коде пакета Telegram: сеть и библиотеку даёт
// проект, пакет говорит с Telegram только через порт Bot API. Импорт
// закрывает сканер импортов, глобальный `fetch` импортом не ловится — его
// ловит эта проверка. Тесты и подставные реализации (`testing/`) не
// проверяются.

const ROOT = resolve(import.meta.dir, '..');
const SRC = 'packages/tg-bot/src';

const scan = (text: string, path = `${SRC}/x.ts`): Violation[] =>
  new NetworkGlobalScanner().scan([SourceFile.of(path, text)]);

describe('NetworkGlobalScanner — глобалы сети в packages/tg-bot/src', () => {
  const forbidden: [string, string][] = [
    ['const answer = await fetch(url);', 'fetch'],
    ['const socket = new WebSocket(url);', 'WebSocket'],
    ['const request = new XMLHttpRequest();', 'XMLHttpRequest'],
    ['const events = new EventSource(url);', 'EventSource'],
    ["const file = Bun.file('token');", 'Bun'],
    ['const token = process.env.BOT_TOKEN;', 'process'],
    ['await globalThis.fetch(url);', 'fetch'],
  ];

  for (const [line, name] of forbidden) {
    it(`«${line}» — нарушение «${name}» с файлом и строкой`, () => {
      expect(scan(`const a = 1;\n${line}\n`)).toEqual([
        { file: `${SRC}/x.ts`, line: 2, text: name },
      ]);
    });
  }

  it('фикстура со всеми глобалами — по нарушению на каждый', () => {
    const fixture = [
      "const answer = await fetch('https://api.telegram.org');",
      'const socket = new WebSocket(url);',
      "Bun.write('x', 'y');",
      'const token = process.env.BOT_TOKEN;',
    ].join('\n');
    expect(scan(fixture).map((v) => `${v.line}:${v.text}`)).toEqual([
      '1:fetch',
      '2:WebSocket',
      '3:Bun',
      '4:process',
    ]);
  });

  it('несколько глобалов в строке — по нарушению на каждый', () => {
    expect(scan('fetch(process.env.URL);').map((v) => v.text)).toEqual([
      'fetch',
      'process',
    ]);
  });

  for (const clean of [
    'this.api.fetch(params);',
    'this.process(update);',
    'const processed = prefetch(update);',
    'const BunDle = 1;',
    'type WebSocketLike = unknown;',
  ]) {
    it(`не глобал «${clean}» не срабатывает`, () => {
      expect(scan(clean)).toEqual([]);
    });
  }

  it('тест в src не проверяется', () => {
    expect(scan('await fetch(url);', `${SRC}/x.test.ts`)).toEqual([]);
  });

  it('testing/ пакета не проверяется', () => {
    expect(
      scan('await fetch(url);', 'packages/tg-bot/testing/bot-api/x.ts'),
    ).toEqual([]);
  });

  it('на реальном packages/tg-bot (весь каталог) — ноль нарушений', () => {
    const files = SourceTree.read(ROOT, 'packages/tg-bot');
    expect(files.some((file) => file.path.startsWith(`${SRC}/`))).toBe(true);
    expect(new NetworkGlobalScanner().scan(files)).toEqual([]);
  });
});
