import { describe, expect, it } from 'bun:test';
import { resolve } from 'node:path';
import { BrowserGlobalScanner } from './browser-globals';
import { SourceFile, SourceTree } from './source-tree';
import type { Violation } from './violation.types';

// Глобалы браузера (`WebSocket`, `window.…`, `document.createElement`, …)
// разрешены только в клиенте страничного пакета и в примере для браузера:
// остальной код работает и на сервере. Голые слова `window`, `document`,
// `history`, `location` встречаются в обычном коде (`'window'` в схемах,
// свойство `history`), поэтому они ловятся по форме использования. Глобалы
// среды `Bun` и `process` запрещены во всём `packages/web-ui/src/`: сервер
// говорит с соединением через порт, клиент выполняется в браузере. Тесты не
// проверяются. `fetch` здесь не ловится: в `tg-bot` его закрывает
// `NetworkGlobalScanner`, а клиенту он понадобится.

const ROOT = resolve(import.meta.dir, '..');
const SRC = 'packages/web-ui/src';

const scan = (text: string, path: string): Violation[] =>
  new BrowserGlobalScanner().scan([SourceFile.of(path, text)]);

describe('BrowserGlobalScanner — глобалы браузера вне клиента', () => {
  const zones = [
    `${SRC}/server/x.ts`,
    `${SRC}/wire/x.ts`,
    `${SRC}/graph/x.ts`,
    `${SRC}/x.ts`,
    'packages/web-ui/testing/x.ts',
    'packages/core/src/x.ts',
    'packages/core/testing/x.ts',
    'packages/chat-ui/src/x.ts',
    'packages/tg-bot/src/x.ts',
    'examples/tg-bot/src/x.ts',
  ];

  for (const path of zones) {
    it(`new WebSocket(url) в ${path} — нарушение с файлом и строкой`, () => {
      expect(
        scan('const a = 1;\nconst s = new WebSocket(url);\n', path),
      ).toEqual([{ file: path, line: 2, text: 'WebSocket' }]);
    });
  }

  const forbidden: [string, string][] = [
    ['const r = new XMLHttpRequest();', 'XMLHttpRequest'],
    ['const e = new EventSource(url);', 'EventSource'],
    ["const v = localStorage.getItem('k');", 'localStorage'],
    ["sessionStorage.setItem('k', 'v');", 'sessionStorage'],
    ['const lang = navigator.language;', 'navigator'],
    ["const db = indexedDB.open('x');", 'indexedDB'],
    ["const c = new BroadcastChannel('x');", 'BroadcastChannel'],
    ['const e = el instanceof HTMLElement;', 'HTMLElement'],
    ['requestAnimationFrame(tick);', 'requestAnimationFrame'],
    ["addEventListener('click', f);", 'addEventListener'],
    ["window.addEventListener('x', f);", 'window.addEventListener'],
    ['const w = window.innerWidth;', 'window.innerWidth'],
    ["const d = document.createElement('div');", 'document.createElement'],
    ["const n = document.querySelector('a');", 'document.querySelector'],
    ["const n = document.querySelectorAll('a');", 'document.querySelectorAll'],
    ['const b = document.body;', 'document.body'],
    ['document.cookie = c;', 'document.cookie'],
    ["history.pushState(s, '', u);", 'history.pushState'],
    ["history.replaceState(s, '', u);", 'history.replaceState'],
    ['history.back();', 'history.back'],
    ['const h = location.href;', 'location.href'],
    ['const p = location.pathname;', 'location.pathname'],
    ['location.reload();', 'location.reload'],
    ['const d = globalThis.document;', 'globalThis.document'],
    ['const l = globalThis.location;', 'globalThis.location'],
    ['const w = globalThis.window;', 'globalThis.window'],
    ['const h = globalThis.history;', 'globalThis.history'],
  ];

  for (const [line, name] of forbidden) {
    it(`«${line}» — нарушение «${name}»`, () => {
      expect(scan(line, `${SRC}/server/x.ts`)).toEqual([
        { file: `${SRC}/server/x.ts`, line: 1, text: name },
      ]);
    });
  }

  it('деструктуризация из window — нарушение', () => {
    const found = scan('const { location } = window;', `${SRC}/server/x.ts`);

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ file: `${SRC}/server/x.ts`, line: 1 });
  });

  it('несколько глобалов в строке — по нарушению на каждый', () => {
    expect(
      scan('const s = new WebSocket(location.href);', `${SRC}/server/x.ts`).map(
        (v) => v.text,
      ),
    ).toEqual(['WebSocket', 'location.href']);
  });
});

describe('BrowserGlobalScanner — разрешённые зоны и не глобалы', () => {
  const lines = [
    'const s = new WebSocket(url);',
    "window.addEventListener('x', f);",
    "const d = document.createElement('div');",
    "history.pushState(s, '', u);",
    'const h = location.href;',
    'const d = globalThis.document;',
    'const { location } = window;',
    'const l = localStorage;',
  ].join('\n');

  for (const path of [`${SRC}/client/x.ts`, 'examples/web/src/main.ts']) {
    it(`в ${path} глобалы браузера разрешены`, () => {
      expect(scan(lines, path)).toEqual([]);
    });
  }

  it('вложенный каталог клиента тоже разрешён', () => {
    expect(scan(lines, `${SRC}/client/view/x.ts`)).toEqual([]);
  });

  for (const path of [
    `${SRC}/server/x.test.ts`,
    `${SRC}/client/x.test.ts`,
    `${SRC}/wire/x.test.ts`,
    'packages/web-ui/testing/x.test.ts',
    'packages/core/src/x.test.ts',
    'packages/tg-bot/src/x.test.ts',
  ]) {
    it(`тест ${path} не проверяется`, () => {
      expect(scan(`${lines}\nBun.serve(x);\nprocess.exit(1);`, path)).toEqual(
        [],
      );
    });
  }

  it('код вне packages и examples не проверяется', () => {
    expect(scan(lines, 'checks/x.ts')).toEqual([]);
    expect(scan(lines, 'acceptance/x.ts')).toEqual([]);
  });

  for (const clean of [
    'this.history.push(x);',
    'const last = view.history;',
    "const kind = 'window';",
    "const type = 'document';",
    "const kind: 'window' = 'window';",
    'const BunDle = 1;',
    'type WebSocketLike = unknown;',
    'this.process(update);',
    'const document = parse(text);',
    'const where = this.location;',
    'const processed = reprocess(update);',
    'const addEventListenerCount = 1;',
  ]) {
    it(`не глобал «${clean}» не срабатывает`, () => {
      expect(scan(clean, `${SRC}/server/x.ts`)).toEqual([]);
      expect(scan(clean, 'packages/chat-ui/src/x.ts')).toEqual([]);
    });
  }
});

describe('BrowserGlobalScanner — Bun и process в packages/web-ui/src/', () => {
  const zones = [
    `${SRC}/server/x.ts`,
    `${SRC}/wire/x.ts`,
    `${SRC}/graph/x.ts`,
    `${SRC}/client/x.ts`,
    `${SRC}/x.ts`,
  ];

  for (const path of zones) {
    it(`Bun.serve в ${path} — нарушение`, () => {
      expect(scan('Bun.serve({ port: 0 });', path)).toEqual([
        { file: path, line: 1, text: 'Bun' },
      ]);
    });

    it(`process.env.X в ${path} — нарушение`, () => {
      expect(scan('const x = process.env.X;', path)).toEqual([
        { file: path, line: 1, text: 'process' },
      ]);
    });
  }

  it('Bun и process вне src пакета web-ui (testing/, другие пакеты) этой проверкой не ловятся', () => {
    for (const path of [
      'packages/web-ui/testing/x.ts',
      'packages/tg-bot/src/x.ts',
      'examples/web/src/main.ts',
    ]) {
      expect(scan('Bun.serve(x);\nprocess.exit(1);', path)).toEqual([]);
    }
  });
});

describe('BrowserGlobalScanner — реальный репо', () => {
  const real = () => [
    ...SourceTree.read(ROOT, 'packages'),
    ...SourceTree.read(ROOT, 'examples'),
  ];

  it('клиент packages/web-ui/src/client/ не пуст: проверка не вхолостую', () => {
    expect(real().some((file) => file.path.startsWith(`${SRC}/client/`))).toBe(
      true,
    );
  });

  it('на packages и examples — ноль нарушений', () => {
    expect(new BrowserGlobalScanner().scan(real())).toEqual([]);
  });
});
