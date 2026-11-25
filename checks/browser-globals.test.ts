import { describe, expect, it } from 'bun:test';
import { resolve } from 'node:path';
import { BrowserGlobalScanner } from './browser-globals';
import { SourceFile, SourceTree } from './source-tree';
import type { Violation } from './violation.types';

// API браузера, которых не видит `tsc` (`WebSocket`, `EventSource`,
// `localStorage`, `navigator`, …), разрешены только адаптерам браузера клиента
// страничного пакета и клиенту примера для браузера: остальной код работает и
// на сервере. Имена с DOM-типами (`window`, `document`, `history`, `location`,
// `self`, `XMLHttpRequest`, `indexedDB`, `HTMLElement`,
// `requestAnimationFrame`) отвергает `tsc` корневой программы, их здесь нет
// (`tsconfig.test.ts`: lib и types без DOM). Глобалы среды `Bun` и `process`
// запрещены во всём `packages/web-ui/src/`: сервер говорит с соединением через
// порт, клиент выполняется в браузере. Тесты не проверяются. `fetch` здесь не ловится: в `tg-bot` его закрывает
// `NetworkGlobalScanner`, а клиенту он понадобится.

const ROOT = resolve(import.meta.dir, '..');
const SRC = 'packages/web-ui/src';
/** Файлы клиента, которым браузер разрешён: сверка по реальному репо ниже. */
const ADAPTERS = ['page-browser-socket.ts', 'page-history.types.ts'];

const scan = (text: string, path: string): Violation[] =>
  new BrowserGlobalScanner().scan([SourceFile.of(path, text)]);

describe('BrowserGlobalScanner — глобалы браузера вне клиента', () => {
  const zones = [
    `${SRC}/server/x.ts`,
    'packages/core/testing/x.ts',
    'packages/tg-bot/src/x.ts',
    'packages/example/src/runners/tg-bot/x.ts',
  ];

  for (const path of zones) {
    it(`new WebSocket(url) в ${path} — нарушение с файлом и строкой`, () => {
      expect(
        scan('const a = 1;\nconst s = new WebSocket(url);\n', path),
      ).toEqual([{ file: path, line: 2, text: 'WebSocket' }]);
    });
  }

  const forbidden: [string, string][] = [
    ['const e = new EventSource(url);', 'EventSource'],
    ["const v = localStorage.getItem('k');", 'localStorage'],
    ["sessionStorage.setItem('k', 'v');", 'sessionStorage'],
    ['const lang = navigator.language;', 'navigator'],
    ["const c = new BroadcastChannel('x');", 'BroadcastChannel'],
    ["addEventListener('click', f);", 'addEventListener'],
  ];

  for (const [line, name] of forbidden) {
    it(`«${line}» — нарушение «${name}»`, () => {
      expect(scan(line, `${SRC}/server/x.ts`)).toEqual([
        { file: `${SRC}/server/x.ts`, line: 1, text: name },
      ]);
    });
  }

  it('несколько глобалов в строке — по нарушению на каждый', () => {
    expect(
      scan(
        'const s = new WebSocket(navigator.language);',
        `${SRC}/server/x.ts`,
      ).map((v) => v.text),
    ).toEqual(['WebSocket', 'navigator']);
  });
});

describe('BrowserGlobalScanner — раннер web учебного проекта вне клиента', () => {
  // Разрешение сужено до `runners/web/client/` учебного проекта: серверу и
  // DOM-помощникам глобалы браузера не нужны, зона должна краснеть.
  it('new WebSocket(url) на сервере раннера web — нарушение', () => {
    const path = 'packages/example/src/runners/web/server/x.ts';

    expect(scan('const s = new WebSocket(u);', path)).toEqual([
      { file: path, line: 1, text: 'WebSocket' },
    ]);
  });

  it('сервер раннера web: Bun и process разрешены (проверка среды — только packages/web-ui/src)', () => {
    expect(
      scan(
        'Bun.serve(x);\nprocess.exit(1);',
        'packages/example/src/runners/web/server/x.ts',
      ),
    ).toEqual([]);
  });
});

describe('BrowserGlobalScanner — кодек адреса (web-ui/src/url/)', () => {
  // Кодек получает и отдаёт строку. API кодирования URL — из ES, не браузера:
  // оно разрешено.
  const URLS = `${SRC}/url/page-urls.ts`;

  it('encodeURIComponent и URLSearchParams — не нарушения', () => {
    expect(
      scan(
        'const a = encodeURIComponent(x);\nconst q = new URLSearchParams();',
        URLS,
      ),
    ).toEqual([]);
  });
});

describe('BrowserGlobalScanner — клиент страничного пакета (web-ui/src/client/)', () => {
  // Клиент получает всё от среды аргументом (порт истории, конец провода,
  // часы): так страница однажды сможет работать и на сервере. Глобалы браузера
  // разрешены только файлам-адаптерам, которые и называют типы браузера.
  const line = 'const s = new WebSocket(url);';

  for (const file of ['page-client.ts', 'page-history.ts']) {
    const path = `${SRC}/client/${file}`;

    it(`WebSocket в не-адаптере ${path} — нарушение`, () => {
      expect(scan(line, path)).toEqual([
        { file: path, line: 1, text: 'WebSocket' },
      ]);
    });
  }

  for (const file of ADAPTERS) {
    it(`адаптер ${file} браузер трогать может`, () => {
      expect(scan(line, `${SRC}/client/${file}`)).toEqual([]);
    });
  }
});

describe('BrowserGlobalScanner — разрешённые зоны и не глобалы', () => {
  const lines = [
    'const s = new WebSocket(url);',
    "addEventListener('x', f);",
    'const n = globalThis.navigator;',
    "const e = globalThis['EventSource'];",
    'const { sessionStorage } = globalThis;',
    'const l = localStorage;',
  ].join('\n');

  it('в клиенте раннера web глобалы разрешены', () => {
    expect(
      scan(lines, 'packages/example/src/runners/web/client/main.ts'),
    ).toEqual([]);
  });

  it('вложенный каталог клиента раннера web тоже разрешён', () => {
    expect(
      scan(lines, 'packages/example/src/runners/web/client/view/x.ts'),
    ).toEqual([]);
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

  it('код вне packages не проверяется', () => {
    expect(scan(lines, 'checks/x.ts')).toEqual([]);
    expect(scan(lines, 'acceptance/x.ts')).toEqual([]);
  });

  for (const clean of [
    'const BunDle = 1;',
    'type WebSocketLike = unknown;',
    'this.process(update);',
    'const processed = reprocess(update);',
    'const addEventListenerCount = 1;',
  ]) {
    it(`не глобал «${clean}» не срабатывает`, () => {
      expect(scan(clean, `${SRC}/server/x.ts`)).toEqual([]);
      expect(scan(clean, 'packages/chat-ui/src/x.ts')).toEqual([]);
    });
  }
});

describe('BrowserGlobalScanner — globalThis: член, ключ, деструктуризация', () => {
  const path = `${SRC}/server/x.ts`;
  const forbidden: [string, string][] = [
    ['const s = new globalThis.WebSocket(u);', 'globalThis.WebSocket'],
    ["const s = globalThis['WebSocket'];", 'WebSocket'],
  ];

  for (const [line, name] of forbidden) {
    it(`«${line}» — нарушение «${name}»`, () => {
      expect(scan(line, path)).toEqual([{ file: path, line: 1, text: name }]);
    });
  }

  it('деструктуризация API из globalThis — нарушение', () => {
    expect(scan('const { localStorage } = globalThis;', path)).toEqual([
      { file: path, line: 1, text: 'localStorage' },
    ]);
  });

  for (const clean of [
    'const g = options.globalThis;',
    'const { items } = globalThis;',
  ]) {
    it(`не глобал «${clean}» не срабатывает`, () => {
      expect(scan(clean, path)).toEqual([]);
    });
  }

  it('разрешены в клиенте раннера web', () => {
    expect(
      scan(
        "const n = globalThis.navigator;\nconst w = globalThis['WebSocket'];\nconst { localStorage } = globalThis;",
        'packages/example/src/runners/web/client/x.ts',
      ),
    ).toEqual([]);
  });
});

describe('BrowserGlobalScanner — Bun и process в packages/web-ui/src/', () => {
  const path = `${SRC}/server/x.ts`;

  it('Bun.serve — нарушение', () => {
    expect(scan('Bun.serve({ port: 0 });', path)).toEqual([
      { file: path, line: 1, text: 'Bun' },
    ]);
  });

  it('process.env.X — нарушение', () => {
    expect(scan('const x = process.env.X;', path)).toEqual([
      { file: path, line: 1, text: 'process' },
    ]);
  });

  it('Bun в представлениях пакета (web-ui/src/view/) — нарушение', () => {
    const path = `${SRC}/view/x.ts`;

    expect(scan('Bun.serve({ port: 0 });', path)).toEqual([
      { file: path, line: 1, text: 'Bun' },
    ]);
  });

  it('Bun и process вне src пакета web-ui (testing/, другие пакеты) этой проверкой не ловятся', () => {
    for (const path of [
      'packages/web-ui/testing/x.ts',
      'packages/tg-bot/src/x.ts',
      'packages/example/src/runners/web/client/main.ts',
    ]) {
      expect(scan('Bun.serve(x);\nprocess.exit(1);', path)).toEqual([]);
    }
  });
});

describe('BrowserGlobalScanner — Bun и process через globalThis', () => {
  const path = `${SRC}/server/x.ts`;

  for (const [line, name] of [
    ['const p = globalThis.process;', 'globalThis.process'],
    ['const b = globalThis.Bun;', 'globalThis.Bun'],
    ["const p = globalThis['process'];", "globalThis['process']"],
  ] as const) {
    it(`«${line}» — нарушение`, () => {
      expect(scan(line, path)).toEqual([{ file: path, line: 1, text: name }]);
    });
  }

  it('вне src пакета web-ui не ловится', () => {
    expect(
      scan('const p = globalThis.process;', 'packages/web-ui/testing/x.ts'),
    ).toEqual([]);
  });
});

describe('BrowserGlobalScanner — реальный репо', () => {
  const real = () => [...SourceTree.read(ROOT, 'packages')];

  it('клиент packages/web-ui/src/client/ не пуст: проверка не вхолостую', () => {
    expect(real().some((file) => file.path.startsWith(`${SRC}/client/`))).toBe(
      true,
    );
  });

  it('клиент раннера web packages/example/src/runners/web/client/ не пуст: исключение не фантом', () => {
    expect(
      real().some((file) =>
        file.path.startsWith('packages/example/src/runners/web/client/'),
      ),
    ).toBe(true);
  });

  it('каждый адаптер существует и без исключения даёт нарушение — переименованный файл не станет тихой дырой', () => {
    const files = real();

    for (const path of BrowserGlobalScanner.BROWSER_ADAPTERS) {
      const file = files.find((f) => f.path === path);
      expect(file).toBeDefined();
      const renamed = SourceFile.of(
        `${SRC}/client/renamed-adapter.ts`,
        file?.text ?? '',
      );

      expect(new BrowserGlobalScanner().scan([renamed])).not.toEqual([]);
    }
  });

  it('на packages — ноль нарушений', () => {
    expect(new BrowserGlobalScanner().scan(real())).toEqual([]);
  });
});
