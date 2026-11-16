import { describe, expect, it } from 'bun:test';
import { CoreImportScanner } from './core-import-scanner';
import { SourceFile } from './source-tree';

// Зоны учебного примера (учебный пример): код и манифесты примера берут
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
    "import { DialogChannel } from 'dmg-ui/chat-ui';",
    "import { ExampleDialogAppDef } from 'dmg-ui/chat-ui/testing';",
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

  it('вход примера (example/index.ts) — привязку по относительному пути не импортирует', () => {
    const text = "export { ExampleDialogArch } from 'dmg-ui/chat-ui/testing';";

    expect(scan(text, 'packages/core/testing/example/index.ts')).toHaveLength(
      1,
    );
  });

  it('*.test.ts примера — вне зоны', () => {
    const text = "import { test } from 'bun:test';\nimport 'node:fs';";

    expect(
      scan(text, 'packages/core/testing/example/example-graph.test.ts'),
    ).toEqual([]);
  });
});

describe('CoreImportScanner — помощник рендера (packages/core/testing/preview/)', () => {
  const PREVIEW = 'packages/core/testing/preview/example-preview.ts';

  it('разрешены valibot, dmg-core, dmg-ui', () => {
    const text = [
      "import * as v from 'valibot';",
      "import { ok } from 'dmg-core';",
      "import { ScreenPreview } from 'dmg-ui';",
    ].join('\n');

    expect(scan(text, PREVIEW)).toEqual([]);
  });

  for (const text of [
    "import { UiServer } from 'dmg-ui/server';",
    "import { ScreenPreview } from '../../src/runtime/screen-preview';",
    "import { exampleCodes } from '../example/example-codes';",
    "import fs from 'node:fs';",
  ]) {
    it(`${text} в помощнике — нарушение`, () => {
      expect(scan(text, PREVIEW)).toHaveLength(1);
    });
  }
});
