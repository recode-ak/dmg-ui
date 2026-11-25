import { describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { CoreImportScanner } from './core-import-scanner';
import { SourceFile } from './source-tree';

// Зоны пакета `web-ui`: клиент, представления, провод, сервер, граф, кодек
// адреса и корень канала — свои белые списки; клиент не знает сервер и
// `dmg-core/app`, сервер не знает клиент; представления видят только себя и
// публичные входы ядра — ни клиента, ни провода, ни сервера, ни графа; кодек
// адреса (`url/`) — строка на входе и выходе: никого из канала не видит, его
// видят клиент, граф и корень; каналы-соседи (`chat-ui`, `tg-bot`) и
// собственный вход из `src/` канал не импортирует; привязка примера
// (`testing/`) — своя зона; пример ядра и привязки соседей друг друга не
// знают.

const PAGE = 'packages/web-ui/src';
const CLIENT = `${PAGE}/client/page-client.ts`;
const VIEW = `${PAGE}/view/page-text-presenter.ts`;
const SERVER = `${PAGE}/server/page-host.ts`;
const WIRE = `${PAGE}/wire/page-wire.ts`;
const GRAPH = `${PAGE}/graph/page-graph-provider.ts`;
const URLS = `${PAGE}/url/page-urls.ts`;
const CHANNEL_ROOT = `${PAGE}/index.ts`;
const NEIGHBOURS = [
  "import { a } from 'dmg-ui/chat-ui';",
  "import { a } from 'dmg-ui/tg-bot';",
  "import { a } from 'dmg-ui/web-ui';",
];

const scan = (text: string, path: string) =>
  CoreImportScanner.standard().scan([SourceFile.of(path, text)]);

describe('CoreImportScanner — клиент страничного канала (web-ui/src/client/)', () => {
  it('разрешены valibot, dmg-core, dmg-ui, соседи по client/ и провод', () => {
    const text = [
      "import * as v from 'valibot';",
      "import { Trace } from 'dmg-core';",
      "import { ScreenRuntime } from 'dmg-ui';",
      "import { PageRegions } from './page-regions';",
      "import type { ClientMessage } from '../wire/page-messages';",
    ].join('\n');

    expect(scan(text, CLIENT)).toEqual([]);
  });

  it('представления из view/ — разрешены', () => {
    expect(
      scan("import { PageRenderer } from '../view/page-renderer';", CLIENT),
    ).toEqual([]);
  });

  it('кодек адреса из url/ — разрешён', () => {
    expect(
      scan("import { PageUrls } from '../url/page-urls';", CLIENT),
    ).toEqual([]);
  });

  it('константа канала из корня (page-channel.const) — разрешена, прочий корень — нет', () => {
    expect(
      scan("import { PAGE_CHANNEL } from '../page-channel.const';", CLIENT),
    ).toEqual([]);
    expect(scan("import { PageWire } from '../index';", CLIENT)).toHaveLength(
      1,
    );
  });

  for (const text of [
    "import { UiServer } from 'dmg-ui/server';",
    "import { a } from 'dmg-core/app';",
    "import { a } from 'dmg-core/graph';",
    "import { UI_EDGE_KINDS } from 'dmg-ui/graph';",
    "import fs from 'node:fs';",
    "import { PageHost } from '../server/page-host';",
    "import { PageGraphProvider } from '../graph/page-graph-provider';",
    "import { ScreenRuntime } from '../../../core/src/runtime/screen-runtime';",
  ]) {
    it(`${text} в клиенте — нарушение`, () => {
      expect(scan(text, CLIENT)).toHaveLength(1);
    });
  }

  for (const text of NEIGHBOURS) {
    it(`${text} в клиенте — нарушение`, () => {
      expect(scan(text, CLIENT)).toHaveLength(1);
    });
  }
});

describe('CoreImportScanner — исключение page-channel.const', () => {
  it('файл константы канала существует в корне web-ui/src — исключение не фантом', () => {
    const root = resolve(import.meta.dir, '..');

    expect(existsSync(resolve(root, PAGE, 'page-channel.const.ts'))).toBe(true);
  });
});

describe('CoreImportScanner — провод страничного канала (web-ui/src/wire/)', () => {
  it('разрешены valibot, dmg-core, dmg-ui и соседи по wire/', () => {
    const text = [
      "import * as v from 'valibot';",
      "import type { SerializedResult } from 'dmg-core';",
      "import type { RefreshSignal } from 'dmg-ui';",
      "import { PageMessages } from './page-messages';",
    ].join('\n');

    expect(scan(text, WIRE)).toEqual([]);
  });

  for (const text of [
    "import { UiServer } from 'dmg-ui/server';",
    "import { a } from 'dmg-core/app';",
    "import { PageClient } from '../client/page-client';",
    "import { PageHost } from '../server/page-host';",
    "import { PageRenderer } from '../view/page-renderer';",
    "import { PageUrls } from '../url/page-urls';",
  ]) {
    it(`${text} в проводе — нарушение`, () => {
      expect(scan(text, WIRE)).toHaveLength(1);
    });
  }
});

describe('CoreImportScanner — сервер страничного канала (web-ui/src/server/)', () => {
  it('разрешены dmg-ui/server, соседи по server/ и провод', () => {
    const text = [
      "import * as v from 'valibot';",
      "import { Trace } from 'dmg-core';",
      "import { UiServer } from 'dmg-ui/server';",
      "import { PageConnection } from './page-connection';",
      "import { PageMessages } from '../wire/page-messages';",
    ].join('\n');

    expect(scan(text, SERVER)).toEqual([]);
  });

  it('константа канала из корня (page-channel.const) — разрешена, прочий корень — нет', () => {
    expect(
      scan("import { PAGE_CHANNEL } from '../page-channel.const';", SERVER),
    ).toEqual([]);
    expect(scan("import { PageWire } from '../index';", SERVER)).toHaveLength(
      1,
    );
  });

  for (const text of [
    "import { PageClient } from '../client/page-client';",
    "import { PageGraphProvider } from '../graph/page-graph-provider';",
    "import { PageRenderer } from '../view/page-renderer';",
    "import { PageUrls } from '../url/page-urls';",
    "import { a } from 'dmg-core/app';",
    "import { a } from 'dmg-core/graph';",
    "import fs from 'node:fs';",
    "import { ScreenRuntime } from '../../../core/src/runtime/screen-runtime';",
  ]) {
    it(`${text} в сервере — нарушение`, () => {
      expect(scan(text, SERVER)).toHaveLength(1);
    });
  }
});

describe('CoreImportScanner — представления страничного канала (web-ui/src/view/)', () => {
  it('разрешены valibot, dmg-core, dmg-ui и соседи по view/', () => {
    const text = [
      "import * as v from 'valibot';",
      "import type { TraceJson } from 'dmg-core';",
      "import { UiIds } from 'dmg-ui';",
      "import type { PageViews } from './page-views';",
      "import type { ViewSource } from './view-source.types';",
    ].join('\n');

    expect(scan(text, VIEW)).toEqual([]);
  });

  for (const text of [
    "import { PageClient } from '../client/page-client';",
    "import { ClientMessage } from '../wire/page-messages';",
    "import { PageHost } from '../server/page-host';",
    "import { PAGE_KINDS } from '../graph/page-kinds';",
    "import { PageUrls } from '../url/page-urls';",
    "import { PAGE_CHANNEL } from '../page-channel.const';",
    "import { UiServer } from 'dmg-ui/server';",
    "import { UI_EDGE_KINDS } from 'dmg-ui/graph';",
    "import type { GraphProvider } from 'dmg-core/graph';",
    "import { a } from 'dmg-core/app';",
    "import fs from 'node:fs';",
  ]) {
    it(`${text} в представлениях — нарушение`, () => {
      expect(scan(text, VIEW)).toHaveLength(1);
    });
  }
});

describe('CoreImportScanner — граф страничного канала (web-ui/src/graph/)', () => {
  it('разрешены dmg-core/graph, dmg-ui/graph и соседи', () => {
    const text = [
      "import type { GraphProvider } from 'dmg-core/graph';",
      "import { UI_EDGE_KINDS } from 'dmg-ui/graph';",
      "import { UiIds } from 'dmg-ui';",
      "import { PAGE_KINDS } from './page-kinds';",
    ].join('\n');

    expect(scan(text, GRAPH)).toEqual([]);
  });

  it('маршрут из url/ — разрешён', () => {
    expect(
      scan("import { PageRouteDef } from '../url/page-route-def';", GRAPH),
    ).toEqual([]);
  });

  for (const text of [
    "import { PageHost } from '../server/page-host';",
    "import { UiServer } from 'dmg-ui/server';",
    "import { PageMessages } from '../wire/page-messages';",
    "import { PageClient } from '../client/page-client';",
    "import { a } from 'dmg-core/app';",
    "import type { PageViews } from '../view/page-views';",
  ]) {
    it(`${text} в графе канала — нарушение`, () => {
      expect(scan(text, GRAPH)).toHaveLength(1);
    });
  }
});

describe('CoreImportScanner — кодек адреса страничного канала (web-ui/src/url/)', () => {
  it('разрешены valibot, dmg-core, dmg-ui и соседи по url/', () => {
    const text = [
      "import * as v from 'valibot';",
      "import { toJsonSchema } from 'dmg-core';",
      "import { AddressCodec } from 'dmg-ui';",
      "import { PagePath } from './page-path';",
    ].join('\n');

    expect(scan(text, URLS)).toEqual([]);
  });

  for (const text of [
    "import { PageClient } from '../client/page-client';",
    "import { PageGraphProvider } from '../graph/page-graph-provider';",
    "import { PageHost } from '../server/page-host';",
    "import { PageWire } from '../wire/page-wire';",
    "import { PageViews } from '../view/page-views';",
    "import { PAGE_CHANNEL } from '../page-channel.const';",
    "import { UiServer } from 'dmg-ui/server';",
    "import { UI_EDGE_KINDS } from 'dmg-ui/graph';",
    "import type { GraphProvider } from 'dmg-core/graph';",
    "import { a } from 'dmg-core/app';",
    "import fs from 'node:fs';",
  ]) {
    it(`${text} в кодеке адреса — нарушение`, () => {
      expect(scan(text, URLS)).toHaveLength(1);
    });
  }
});

describe('CoreImportScanner — корень страничного канала (web-ui/src/*.ts)', () => {
  it('разрешены публичные входы ядра и соседи по корню', () => {
    const text = [
      "import * as v from 'valibot';",
      "import { Trace } from 'dmg-core';",
      "import type { GraphKinds } from 'dmg-core/graph';",
      "import { ScreenRuntime } from 'dmg-ui';",
      "import { UiServer } from 'dmg-ui/server';",
      "import { UI_EDGE_KINDS } from 'dmg-ui/graph';",
      "import { PAGE_CHANNEL } from './page-channel.const';",
    ].join('\n');

    expect(scan(text, CHANNEL_ROOT)).toEqual([]);
  });

  it('представления из view/ — разрешены', () => {
    expect(
      scan("import { PageViews } from './view/page-views';", CHANNEL_ROOT),
    ).toEqual([]);
  });

  it('кодек адреса из url/ — разрешён', () => {
    expect(
      scan("import { PageUrls } from './url/page-urls';", CHANNEL_ROOT),
    ).toEqual([]);
  });

  for (const text of [
    "import { ScreenRuntime } from '../../core/src/runtime/screen-runtime';",
    "import { TaskListScreenDef } from '../../example/src/platform/ui/todo/shared/task-list.screen';",
    "import fs from 'node:fs';",
  ]) {
    it(`${text} в корне канала — нарушение`, () => {
      expect(scan(text, CHANNEL_ROOT)).toHaveLength(1);
    });
  }
});

describe('CoreImportScanner — привязка примера (packages/web-ui/testing/)', () => {
  const BINDING = 'packages/web-ui/testing/text-views/example-pages.views.ts';

  it('разрешены граф, сборка ArchApp, пример, помощники, ядро и канал по имени входа', () => {
    const text = [
      "import * as v from 'valibot';",
      "import { F } from 'dmg-core';",
      "import { ScreenDef } from 'dmg-ui';",
      "import { UI_EDGE_KINDS, UiGraphProvider } from 'dmg-ui/graph';",
      "import { RenderFlags } from 'dmg-ui/server';",
      "import type { GraphProvider } from 'dmg-core/graph';",
      "import type { ArchApp } from 'dmg-core/arch';",
      "import { ExampleArch } from 'dmg-core/testing';",
      "import { ListTasksUcDef } from 'dmg-core/testing/example';",
      "import { TaskListScreenDef } from 'dmg-ui/testing';",
      "import { T0 } from 'dmg-ui/testing/fixtures';",
      "import { PageViews } from 'dmg-ui/web-ui';",
      "import { ExamplePagesUiAppDef } from 'dmg-ui/example';",
      "import { TaskLines } from './task-lines';",
    ].join('\n');

    expect(scan(text, BINDING)).toEqual([]);
  });

  for (const text of [
    "import fs from 'node:fs';",
    "import { a } from 'dmg-core/app';",
    "import { PageViews } from '../../src/view/page-views';",
    "import { UiIds } from '../../../core/src/address/ui-ids';",
  ]) {
    it(`${text} в привязке страниц — нарушение`, () => {
      expect(scan(text, BINDING)).toHaveLength(1);
    });
  }
});
