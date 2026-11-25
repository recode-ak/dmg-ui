import { describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { CoreImportScanner } from './core-import-scanner';
import { SourceFile } from './source-tree';

// Канал web учебного проекта едет в сборку для браузера: виды модулей
// (`frontend/<m>/web/`), kit (`frontend/web-kit/`) и раннер `web` — оболочка
// в корне, общее (`common/`), DOM-помощники (`view/`) и клиент (`client/`). Ни
// `node:*`, ни `bun:*`, ни серверных входов платформы. Раннер `web` делит
// клиент и сервер: клиент не видит сервер и тестовую фикстуру, сервер и
// фикстура не видят клиента — иначе корневая программа потянула бы DOM-код;
// `common/` видит только себя. Чужие каналы (Telegram, диалог) не видит никто:
// ни по имени входа, ни относительным путём к их видам, kit и раннерам.

const P = 'packages/example/src';
const WEB = `${P}/runners/web`;
const COMMON = `${WEB}/common/example-people.const.ts`;
const VIEW = `${WEB}/view/region-frame.ts`;
const CLIENT = `${WEB}/client/example-page.ts`;
const SHELL = `${WEB}/example-pages.ui-app.ts`;
const SERVER = `${WEB}/server/example-web-server.ts`;
const FIXTURE = `${WEB}/testing/example-world.ts`;
const FRONT = `${P}/frontend/todo/web/shared/task-list.view.ts`;

const scan = (text: string, path: string) =>
  CoreImportScanner.standard().scan([SourceFile.of(path, text)]);

/** Каждый спецификатор в файле — ровно одно нарушение. */
const eachViolates = (path: string, specs: readonly string[]) => {
  for (const spec of specs) {
    expect(scan(`import { a } from '${spec}';`, path)).toHaveLength(1);
  }
};

/** Чужие каналы: их не видит ни один каталог канала web. */
const FOREIGN = ['dmg-ui/chat-ui', 'dmg-ui/tg-bot', 'dmg-ui/chat-ui/testing'];

describe('CoreImportScanner — канал web учебного проекта, едущий в браузер', () => {
  const BROWSER_ZONES: [string, string][] = [
    ['common', COMMON],
    ['view', VIEW],
    ['client', CLIENT],
    ['оболочка', SHELL],
    ['вид модуля todo', FRONT],
    ['вид модуля users', `${P}/frontend/users/web/view-user/user-card.view.ts`],
    ['web-kit', `${P}/frontend/web-kit/example-screen-view.ts`],
  ];

  for (const [name, path] of BROWSER_ZONES) {
    it(`${name}: среда, серверные входы, граф, тестовые входы и чужие каналы — нарушения`, () => {
      eachViolates(path, [
        'node:fs',
        'fs',
        'dmg-core/app',
        'dmg-core/arch',
        'dmg-ui/server',
        'dmg-ui/graph',
        'dmg-core/testing',
        ...FOREIGN,
      ]);
    });
  }

  it('view/, client/ и оболочка не видят сервер и тестовую фикстуру раннера', () => {
    eachViolates(VIEW, ['../server/x', '../testing/example-world']);
    eachViolates(CLIENT, ['../server/x', '../testing/example-world']);
    eachViolates(SHELL, ['./server/x', './testing/example-world']);
  });

  it('клиент, view/ и оболочка не берут относительным путём чужие каналы и раннеры', () => {
    eachViolates(CLIENT, [
      '../../../frontend/todo/chat',
      '../../../frontend/users/chat/view-user/user-card.view',
      '../../../frontend/todo/telegram',
      '../../../frontend/telegram-kit/example-moment.const',
      '../../tg-bot/example-bot',
      '../../dialog/example-dialog-views',
    ]);
    eachViolates(VIEW, ['../../dialog/example-dialog-views']);
    eachViolates(SHELL, ['../tg-bot/example-telegram-views']);
  });

  it('вид модуля web и web-kit не берут относительным путём чужие каналы и раннеры', () => {
    eachViolates(FRONT, [
      '../../chat/shared/task-list.view',
      '../../telegram',
      '../../../telegram-kit/example-moment.const',
      '../../../../runners/dialog/example-dialog-views',
    ]);
    eachViolates(`${P}/frontend/web-kit/example-views.ts`, [
      '../todo/chat',
      '../../runners/tg-bot/example-bot',
    ]);
  });

  it('свой канал и общее раннера web относительным путём — чисто', () => {
    const text = [
      "import { todoWebViews } from '../../../frontend/todo/web';",
      "import { RegionModel } from '../../../frontend/web-kit/region-model.types';",
      "import { exampleCodes } from '../../example-codes';",
    ].join('\n');

    expect(scan(text, CLIENT)).toEqual([]);
  });

  it('клиент не видят view/, common/ и оболочка', () => {
    eachViolates(VIEW, ['../client/x']);
    eachViolates(COMMON, ['../client/x']);
    eachViolates(SHELL, ['./client/x']);
  });

  it('common/ видит только себя и valibot', () => {
    const text = [
      "import * as v from 'valibot';",
      "import { EXAMPLE_REGIONS } from './example-web.const';",
    ].join('\n');

    expect(scan(text, COMMON)).toEqual([]);
    eachViolates(COMMON, ['../view/x', 'dmg-ui']);
  });

  it('разрешённый набор view/: себя, common/, kit, оболочку, описание, valibot, dmg-core, dmg-ui, web-ui и учебный домен', () => {
    const text = [
      "import * as v from 'valibot';",
      "import { Result } from 'dmg-core';",
      "import { ScreenRuntime } from 'dmg-ui';",
      "import { PageClient } from 'dmg-ui/web-ui';",
      "import { ListTasksUcDef } from 'dmg-core/testing/example';",
      "import { ControlIds } from './control-ids';",
      "import { EXAMPLE_PEOPLE } from '../common/example-people.const';",
      "import { RegionModel } from '../../../frontend/web-kit/region-model.types';",
      "import { exampleWebViews } from '../example-web-views';",
      "import { LIST_ID } from '../../../platform/ui';",
    ].join('\n');

    expect(scan(text, VIEW)).toEqual([]);
  });

  it('разрешённый набор client/: то же, что у view/, плюс view/ и сборка кода', () => {
    const text = [
      "import { PageClient } from 'dmg-ui/web-ui';",
      "import { dom } from './dom-element';",
      "import { RegionFrame } from '../view/region-frame';",
      "import { exampleCodes } from '../../example-codes';",
      "import { ExamplePagesUiAppDef } from '../example-pages.ui-app';",
    ].join('\n');

    expect(scan(text, CLIENT)).toEqual([]);
  });

  it('вид модуля web: valibot, dmg-core, dmg-ui, web-ui и учебный домен — чисто, тестовые входы — нарушение', () => {
    const text = [
      "import * as v from 'valibot';",
      "import { Result } from 'dmg-core';",
      "import { ScreenDef } from 'dmg-ui';",
      "import { PageViews } from 'dmg-ui/web-ui';",
      "import { ListTasksUcDef } from 'dmg-core/testing/example';",
    ].join('\n');

    expect(scan(text, FRONT)).toEqual([]);
    eachViolates(FRONT, ['dmg-ui/testing', 'dmg-ui/web-ui/testing']);
  });
});

describe('CoreImportScanner — сервер и фикстура раннера web', () => {
  it('разрешённый набор сервера целиком — чисто', () => {
    const text = [
      "import fs from 'node:fs';",
      "import { serve } from 'bun:ffi';",
      "import * as v from 'valibot';",
      "import { App } from 'dmg-core/app';",
      "import { ArchChecker } from 'dmg-core/arch';",
      "import { ExampleApp } from 'dmg-core/testing';",
      "import { ListTasksUcDef } from 'dmg-core/testing/example';",
      "import { UiServer } from 'dmg-ui/server';",
      "import { UiGraphProvider } from 'dmg-ui/graph';",
      "import { PageHost } from 'dmg-ui/web-ui';",
      "import { ManualPageClock } from 'dmg-ui/web-ui/testing';",
      "import { ExamplePreview } from 'dmg-ui/testing';",
      "import { fixtures } from 'dmg-ui/testing/fixtures';",
      "import { ExampleWeb } from './example-web';",
      "import { a } from '../view/x';",
      "import { a } from '../common/x';",
      "import { a } from '../example-web-views';",
      "import { exampleCodes } from '../../example-codes';",
    ].join('\n');

    expect(scan(text, SERVER)).toEqual([]);
  });

  it('разрешённый набор фикстуры — чисто', () => {
    const text = [
      "import { join } from 'node:path';",
      "import { test } from 'bun:test';",
      "import { AwaitingBus } from 'dmg-core/testing';",
      "import { UiServer } from 'dmg-ui/server';",
      "import { PageHost } from 'dmg-ui/web-ui';",
      "import { PLACES } from '../server/example-web.const';",
      "import { EXAMPLE_PEOPLE } from '../common/example-people.const';",
      "import { exampleWebPlacements } from '../example-web.placements';",
    ].join('\n');

    expect(scan(text, FIXTURE)).toEqual([]);
  });

  const NODE_ZONES: [string, string][] = [
    ['сервер', SERVER],
    ['фикстура', FIXTURE],
  ];

  for (const [name, path] of NODE_ZONES) {
    it(`${name}: клиент раннера и чужие каналы — нарушения`, () => {
      eachViolates(path, ['../client/x', ...FOREIGN]);
    });
  }
});

describe('учебный проект не устанавливается', () => {
  const ROOT = resolve(import.meta.dir, '..');

  it('своего package.json у проекта нет', () => {
    expect(existsSync(resolve(ROOT, 'packages/example/package.json'))).toBe(
      false,
    );
  });
});
