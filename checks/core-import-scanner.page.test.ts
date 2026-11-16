import { describe, expect, it } from 'bun:test';
import { CoreImportScanner } from './core-import-scanner';
import { SourceFile } from './source-tree';

// Зоны страничного канала (критерий 11 фазы 6): клиент, провод, сервер, граф
// и корень канала — свои белые списки; клиент не знает сервер и `dmg-core/app`,
// сервер не знает клиент; пример не знает привязок.

const PAGE = 'packages/core/testing/page';
const CLIENT = `${PAGE}/client/page-client.ts`;
const SERVER = `${PAGE}/server/page-host.ts`;
const WIRE = `${PAGE}/wire/page-wire.ts`;
const GRAPH = `${PAGE}/graph/page-graph-provider.ts`;
const CHANNEL_ROOT = `${PAGE}/index.ts`;

const scan = (text: string, path: string) =>
  CoreImportScanner.standard().scan([SourceFile.of(path, text)]);

describe('CoreImportScanner — клиент страничного канала (page/client/)', () => {
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

  for (const text of [
    "import { UiServer } from 'dmg-ui/server';",
    "import { a } from 'dmg-core/app';",
    "import { a } from 'dmg-core/graph';",
    "import { UI_EDGE_KINDS } from 'dmg-ui/graph';",
    "import fs from 'node:fs';",
    "import { test } from 'bun:test';",
    "import { PageHost } from '../server/page-host';",
    "import { PageRouteDef } from '../graph/page-route-def';",
    "import { ScreenRuntime } from '../../../src/runtime/screen-runtime';",
  ]) {
    it(`${text} в клиенте — нарушение`, () => {
      expect(scan(text, CLIENT)).toHaveLength(1);
    });
  }

  it('*.test.ts клиента — вне зоны', () => {
    const text = "import { test } from 'bun:test';\nimport 'node:fs';";

    expect(scan(text, `${PAGE}/client/page-client.test.ts`)).toEqual([]);
  });
});

describe('CoreImportScanner — провод страничного канала (page/wire/)', () => {
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
  ]) {
    it(`${text} в проводе — нарушение`, () => {
      expect(scan(text, WIRE)).toHaveLength(1);
    });
  }
});

describe('CoreImportScanner — сервер страничного канала (page/server/)', () => {
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

  for (const text of [
    "import { PageClient } from '../client/page-client';",
    "import { PageRouteDef } from '../graph/page-route-def';",
    "import { a } from 'dmg-core/app';",
    "import { a } from 'dmg-core/graph';",
    "import fs from 'node:fs';",
    "import { ScreenRuntime } from '../../../src/runtime/screen-runtime';",
  ]) {
    it(`${text} в сервере — нарушение`, () => {
      expect(scan(text, SERVER)).toHaveLength(1);
    });
  }
});

describe('CoreImportScanner — граф страничного канала (page/graph/)', () => {
  it('разрешены dmg-core/graph, dmg-ui/graph, соседи и тип PageViews из client/', () => {
    const text = [
      "import type { GraphProvider } from 'dmg-core/graph';",
      "import { UI_EDGE_KINDS } from 'dmg-ui/graph';",
      "import { UiIds } from 'dmg-ui';",
      "import { PageRouteDef } from './page-route-def';",
      "import type { PageViews } from '../client/page-views';",
    ].join('\n');

    expect(scan(text, GRAPH)).toEqual([]);
  });

  for (const text of [
    "import { PageHost } from '../server/page-host';",
    "import { UiServer } from 'dmg-ui/server';",
    "import { PageMessages } from '../wire/page-messages';",
    "import { a } from 'dmg-core/app';",
  ]) {
    it(`${text} в графе канала — нарушение`, () => {
      expect(scan(text, GRAPH)).toHaveLength(1);
    });
  }
});

describe('CoreImportScanner — корень страничного канала (page/*.ts)', () => {
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

  for (const text of [
    "import { ScreenRuntime } from '../../src/runtime/screen-runtime';",
    "import { TaskListScreenDef } from '../example/todo/task-list.screen';",
    "import fs from 'node:fs';",
  ]) {
    it(`${text} в корне канала — нарушение`, () => {
      expect(scan(text, CHANNEL_ROOT)).toHaveLength(1);
    });
  }
});

describe('CoreImportScanner — пример и привязки не знают друг друга', () => {
  it('код примера не импортирует привязку страниц', () => {
    const text = "import { a } from '../pages/example-pages.app';";

    expect(
      scan(text, 'packages/core/testing/example/todo/task-list.screen.ts'),
    ).toHaveLength(1);
  });

  it('вход примера (example/index.ts) — привязку страниц не импортирует', () => {
    const text =
      "export { ExamplePagesArch } from './pages/example-pages.arch';";

    expect(scan(text, 'packages/core/testing/example/index.ts')).toHaveLength(
      1,
    );
  });

  it('привязка диалога не импортирует привязку страниц', () => {
    const text = "import { a } from '../pages/example-pages.app';";

    expect(
      scan(text, 'packages/core/testing/example/dialog/example-dialog.arch.ts'),
    ).toHaveLength(1);
  });
});

describe('CoreImportScanner — привязка примера к страничному каналу (example/pages/)', () => {
  const BINDING = 'packages/core/testing/example/pages/example-pages.arch.ts';

  it('разрешены граф, сборка ArchApp, пример и страничный канал', () => {
    const text = [
      "import * as v from 'valibot';",
      "import { F } from 'dmg-core';",
      "import { ScreenDef } from 'dmg-ui';",
      "import { UI_EDGE_KINDS, UiGraphProvider } from 'dmg-ui/graph';",
      "import type { GraphProvider } from 'dmg-core/graph';",
      "import type { ArchApp } from 'dmg-core/arch';",
      "import { ExampleArch } from 'dmg-core/testing';",
      "import { ListTasksUcDef } from 'dmg-core/testing/example';",
      "import { TaskListScreenDef } from '../todo/task-list.screen';",
      "import { PageViews } from '../../page/client/page-views';",
      "import { PageGraphProvider } from '../../page/graph/page-graph-provider';",
    ].join('\n');

    expect(scan(text, BINDING)).toEqual([]);
  });

  for (const text of [
    "import fs from 'node:fs';",
    "import { test } from 'bun:test';",
    "import { UiIds } from '../../../src/address/ui-ids';",
    "import { ExampleDialogAppDef } from '../dialog/example-dialog.app';",
    "import { DialogViews } from '../../dialog/dialog-views';",
  ]) {
    it(`${text} в привязке страниц — нарушение`, () => {
      expect(scan(text, BINDING)).toHaveLength(1);
    });
  }
});
