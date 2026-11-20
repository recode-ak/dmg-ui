import { describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { CoreImportScanner } from './core-import-scanner';
import { SourceFile, SourceTree } from './source-tree';

// Зоны примера для браузера (`examples/web/src/`): общее (`common/`), модели
// представлений (`view/`), клиент (`client/`), сервер (`server/`). `common/`,
// `view/` и `client/` едут в сборку для браузера: ни `node:*`, ни `bun:*`, ни
// серверных входов платформы. Клиент видит `view/` и `common/`; `view/` —
// только себя и `common/`; сервер видит `common/` и `view/` (реестр для
// графа), но не клиента — иначе корневая программа потянула бы DOM-код.
// Чужие пакеты (библиотека Telegram, каналы-соседи) не видит никто.

const WEB = 'examples/web/src';
const COMMON = `${WEB}/common/example-people.const.ts`;
const VIEW = `${WEB}/view/region-frame.ts`;
const CLIENT = `${WEB}/client/example-page.ts`;
const SERVER = `${WEB}/server/example-web-server.ts`;

const scan = (text: string, path: string) =>
  CoreImportScanner.standard().scan([SourceFile.of(path, text)]);

const BROWSER_ZONES: [string, string][] = [
  ['common', COMMON],
  ['view', VIEW],
  ['client', CLIENT],
];

const FOREIGN = [
  "import { a } from 'dmg-ui/chat-ui';",
  "import { a } from 'dmg-ui/tg-bot';",
  "import { a } from 'dmg-ui/chat-ui/testing';",
];

describe('CoreImportScanner — каталоги примера, едущие в браузер', () => {
  for (const [name, path] of BROWSER_ZONES) {
    for (const text of [
      "import fs from 'node:fs';",
      "import fs from 'fs';",
      "import { a } from 'dmg-core/app';",
      "import { a } from 'dmg-core/arch';",
      "import { a } from 'dmg-core/testing';",
      "import { UiServer } from 'dmg-ui/server';",
      "import { a } from 'dmg-ui/graph';",
      "import { a } from '../server/x';",
      "import { a } from '../../../tg-bot/src/x';",
    ]) {
      it(`${text} в ${name}/ — нарушение`, () => {
        expect(scan(text, path)).toHaveLength(1);
      });
    }
  }

  it('клиент: `../client/x` из view/ и common/ — нарушение', () => {
    expect(scan("import { a } from '../client/x';", VIEW)).toHaveLength(1);
    expect(scan("import { a } from '../client/x';", COMMON)).toHaveLength(1);
  });

  it('view/ из common/ — нарушение: общий каталог не знает никого', () => {
    expect(scan("import { a } from '../view/x';", COMMON)).toHaveLength(1);
  });

  it('разрешённый набор view/: себя, common/, valibot, dmg-core, dmg-ui, web-ui и тестовые входы учебного домена', () => {
    const text = [
      "import * as v from 'valibot';",
      "import { Result } from 'dmg-core';",
      "import { ScreenRuntime } from 'dmg-ui';",
      "import { PageClient } from 'dmg-ui/web-ui';",
      "import { ListTasksUcDef } from 'dmg-core/testing/example';",
      "import { taskRow } from 'dmg-ui/testing';",
      "import { examplePagesRoutes } from 'dmg-ui/web-ui/testing';",
      "import { RegionModel } from './region-model.types';",
      "import { EXAMPLE_PEOPLE } from '../common/example-people.const';",
    ].join('\n');

    expect(scan(text, VIEW)).toEqual([]);
  });

  it('разрешённый набор client/: то же, что у view/, плюс view/ и common/', () => {
    const text = [
      "import * as v from 'valibot';",
      "import { Result } from 'dmg-core';",
      "import { ScreenRuntime } from 'dmg-ui';",
      "import { PageClient } from 'dmg-ui/web-ui';",
      "import { ListTasksUcDef } from 'dmg-core/testing/example';",
      "import { taskRow } from 'dmg-ui/testing';",
      "import { examplePagesRoutes } from 'dmg-ui/web-ui/testing';",
      "import { dom } from './dom-element';",
      "import { RegionFrame } from '../view/region-frame';",
      "import { EXAMPLE_PEOPLE } from '../common/example-people.const';",
    ].join('\n');

    expect(scan(text, CLIENT)).toEqual([]);
  });

  it('разрешённый набор common/: только соседи и valibot', () => {
    const text = [
      "import * as v from 'valibot';",
      "import { EXAMPLE_REGIONS } from './example-web.const';",
    ].join('\n');

    expect(scan(text, COMMON)).toEqual([]);
  });
});

describe('CoreImportScanner — сервер примера (examples/web/src/server/)', () => {
  for (const text of [
    "import fs from 'node:fs';",
    "import { serve } from 'bun:ffi';",
    "import { App } from 'dmg-core/app';",
    "import { ArchChecker } from 'dmg-core/arch';",
    "import { ExampleApp } from 'dmg-core/testing/example';",
    "import { UiServer } from 'dmg-ui/server';",
    "import { UiGraphProvider } from 'dmg-ui/graph';",
    "import { a } from '../view/x';",
    "import { a } from '../common/x';",
  ]) {
    it(`${text} — чисто`, () => {
      expect(scan(text, SERVER)).toEqual([]);
    });
  }

  it('разрешённый набор сервера целиком — чисто', () => {
    const text = [
      "import * as v from 'valibot';",
      "import { Result } from 'dmg-core';",
      "import { ExampleApp } from 'dmg-core/testing';",
      "import { ScreenRuntime } from 'dmg-ui';",
      "import { PageHost } from 'dmg-ui/web-ui';",
      "import { examplePagesRoutes } from 'dmg-ui/web-ui/testing';",
      "import { ExampleArch } from 'dmg-ui/testing';",
      "import { fixtures } from 'dmg-ui/testing/fixtures';",
      "import { ExampleWeb } from './example-web';",
    ].join('\n');

    expect(scan(text, SERVER)).toEqual([]);
  });

  it('клиент примера — нарушение: серверу DOM-код не нужен', () => {
    const found = scan("import { a } from '../client/x';", SERVER);

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ file: SERVER, line: 1 });
  });

  it('относительный выход за каталог примера — нарушение', () => {
    expect(
      scan("import { a } from '../../../tg-bot/src/x';", SERVER),
    ).toHaveLength(1);
  });
});

describe('CoreImportScanner — чужие пакеты в примере для браузера', () => {
  const zones: [string, string][] = [...BROWSER_ZONES, ['server', SERVER]];

  for (const [name, path] of zones) {
    for (const text of FOREIGN) {
      it(`${text} в ${name}/ — нарушение`, () => {
        expect(scan(text, path)).toHaveLength(1);
      });
    }
  }
});

describe('пример не устанавливается', () => {
  const ROOT = resolve(import.meta.dir, '..');

  it('своего package.json у примера нет', () => {
    expect(existsSync(resolve(ROOT, 'examples/web/package.json'))).toBe(false);
  });
});

describe('CoreImportScanner — общая фикстура примера (examples/web/src/testing/)', () => {
  const FIXTURE = `${WEB}/testing/example-world.ts`;

  it('разрешённый набор — чисто', () => {
    const text = [
      "import { join } from 'node:path';",
      "import { test } from 'bun:test';",
      "import * as v from 'valibot';",
      "import { AwaitingBus } from 'dmg-core/testing';",
      "import { ExampleApp } from 'dmg-core/testing/example';",
      "import { UiServer } from 'dmg-ui/server';",
      "import { PageHost } from 'dmg-ui/web-ui';",
      "import { PLACES } from '../server/example-web.const';",
      "import { EXAMPLE_PEOPLE } from '../common/example-people.const';",
      "import { exampleWebPlacements } from '../view/example-web.placements';",
    ].join('\n');

    expect(scan(text, FIXTURE)).toEqual([]);
  });

  it('клиент примера — нарушение', () => {
    expect(scan("import { a } from '../client/x';", FIXTURE)).toHaveLength(1);
  });

  for (const text of FOREIGN) {
    it(`${text} — нарушение`, () => {
      expect(scan(text, FIXTURE)).toHaveLength(1);
    });
  }
});

describe('CoreImportScanner — реальный пример', () => {
  it('на examples/web — ноль нарушений', () => {
    const files = SourceTree.read(
      resolve(import.meta.dir, '..'),
      'examples/web',
    );

    expect(CoreImportScanner.standard().scan(files)).toEqual([]);
  });
});
