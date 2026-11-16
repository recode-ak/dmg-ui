import { describe, expect, it } from 'bun:test';
import { CoreImportScanner } from './core-import-scanner';
import { SourceFile } from './source-tree';

// Зона учебного канала (ARC-08): канал и помощник рендера знают только
// публичные входы `dmg-ui` и `dmg-core` — не `src/` и не пример по
// относительному пути. Помощник рендера от сервера не зависит.

const scan = (text: string, path: string) =>
  CoreImportScanner.standard().scan([SourceFile.of(path, text)]);

describe('CoreImportScanner — учебный канал (packages/core/testing/dialog/)', () => {
  const CHANNEL = 'packages/core/testing/dialog/dialog-channel.ts';

  it('разрешены valibot, dmg-core, dmg-core/graph, dmg-ui, dmg-ui/server, dmg-ui/graph и соседи', () => {
    const text = [
      "import * as v from 'valibot';",
      "import { Trace } from 'dmg-core';",
      "import type { GraphProvider } from 'dmg-core/graph';",
      "import { ScreenRuntime } from 'dmg-ui';",
      "import { RenderFlags } from 'dmg-ui/server';",
      "import { UI_EDGE_KINDS } from 'dmg-ui/graph';",
      "import { RefTable } from './ref-table';",
    ].join('\n');

    expect(scan(text, CHANNEL)).toEqual([]);
  });

  for (const text of [
    "import { ScreenRuntime } from '../../src/runtime/screen-runtime';",
    "import { TaskListScreenDef } from '../example/todo/task-list.screen';",
    "import fs from 'node:fs';",
    "import { test } from 'bun:test';",
    "import { ExampleApp } from 'dmg-core/testing/example';",
    "import { useTempDir } from 'dmg-core/testing';",
    "import { a } from 'dmg-core/app';",
  ]) {
    it(`${text} в канале — нарушение`, () => {
      expect(scan(text, CHANNEL)).toHaveLength(1);
    });
  }

  it('*.test.ts канала — вне зоны', () => {
    const text = "import { test } from 'bun:test';\nimport 'node:fs';";

    expect(scan(text, 'packages/core/testing/dialog/dialog.test.ts')).toEqual(
      [],
    );
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
