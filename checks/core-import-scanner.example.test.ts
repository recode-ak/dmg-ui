import { describe, expect, it } from 'bun:test';
import { CoreImportScanner } from './core-import-scanner';
import { SourceFile } from './source-tree';

// Зоны учебного примера (критерий 2 фазы 5): код и манифесты примера берут
// только то, что взял бы проект; привязка к каналу — плюс граф и сборку
// `ArchApp`.

const scan = (text: string, path: string) =>
  CoreImportScanner.standard().scan([SourceFile.of(path, text)]);

describe('CoreImportScanner — учебный пример (packages/core/testing/example/)', () => {
  const EXAMPLE = 'packages/core/testing/example/todo/task-list.screen.ts';

  for (const text of [
    "import { a } from 'dmg-core/app';",
    "import { a } from 'dmg-core/graph';",
    "import { a } from 'dmg-core/arch';",
    "import { a } from 'dmg-core/testing';",
    "import { a } from 'dmg-ui/server';",
    "import { a } from 'dmg-ui/graph';",
    "import { a } from 'dmg-ui/testing';",
    "import fs from 'node:fs';",
    "import { test } from 'bun:test';",
    "import { ScreenDef } from '../../../src/manifest/screen-def';",
    "import { DialogChannel } from '../../dialog/dialog-channel';",
  ]) {
    it(`${text} в примере — нарушение`, () => {
      expect(scan(text, EXAMPLE)).toHaveLength(1);
    });
  }

  it('в примере разрешены valibot, dmg-core, dmg-ui, контракты dmg-core/testing/example и соседи по example/', () => {
    const text = [
      "import * as v from 'valibot';",
      "import { F } from 'dmg-core';",
      "import { ScreenDef } from 'dmg-ui';",
      "import { ListTasksUcDef } from 'dmg-core/testing/example';",
      "import { taskRow } from './example-tasks';",
      "import { ExampleUiSetDef } from '../example-ui.set';",
    ].join('\n');

    expect(scan(text, EXAMPLE)).toEqual([]);
  });

  it('*.test.ts примера — вне зоны', () => {
    const text = "import { test } from 'bun:test';\nimport 'node:fs';";

    expect(
      scan(text, 'packages/core/testing/example/example-graph.test.ts'),
    ).toEqual([]);
  });
});

describe('CoreImportScanner — привязка примера к каналу (example/dialog/)', () => {
  const BINDING = 'packages/core/testing/example/dialog/example-dialog.arch.ts';

  it('разрешены граф, сборка ArchApp, пример и учебный канал', () => {
    const text = [
      "import * as v from 'valibot';",
      "import { F } from 'dmg-core';",
      "import { ScreenDef } from 'dmg-ui';",
      "import { UI_EDGE_KINDS } from 'dmg-ui/graph';",
      "import type { GraphProvider } from 'dmg-core/graph';",
      "import type { ArchApp } from 'dmg-core/arch';",
      "import { ExampleArch } from 'dmg-core/testing';",
      "import { ListTasksUcDef } from 'dmg-core/testing/example';",
      "import { TaskListScreenDef } from '../todo/task-list.screen';",
      "import { DialogViews } from '../../dialog/dialog-views';",
    ].join('\n');

    expect(scan(text, BINDING)).toEqual([]);
  });

  for (const text of [
    "import fs from 'node:fs';",
    "import { test } from 'bun:test';",
    "import { UiIds } from '../../../src/address/ui-ids';",
  ]) {
    it(`${text} в привязке — нарушение`, () => {
      expect(scan(text, BINDING)).toHaveLength(1);
    });
  }
});
