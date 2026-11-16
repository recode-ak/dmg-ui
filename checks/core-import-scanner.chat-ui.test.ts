import { describe, expect, it } from 'bun:test';
import { CoreImportScanner } from './core-import-scanner';
import { SourceFile } from './source-tree';

// Зоны пакета `chat-ui` (ARC-08): код канала знает только публичные входы
// `dmg-ui` и `dmg-core` — не `src/` ядра и не пример по относительному пути;
// тестовый вход канала берёт привязку примера, `tg-bot` — канал по имени
// входа; приёмочный каталог монорепо не ограничен по входам.

const scan = (text: string, path: string) =>
  CoreImportScanner.standard().scan([SourceFile.of(path, text)]);

describe('CoreImportScanner — канал диалога (packages/chat-ui/src/)', () => {
  const CHANNEL = 'packages/chat-ui/src/dialog/dialog-channel.ts';

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
    "import { ScreenRuntime } from '../../../core/src/runtime/screen-runtime';",
    "import { TaskListScreenDef } from '../../testing/example/todo/task-list.screen';",
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

    expect(scan(text, 'packages/chat-ui/src/dialog/dialog.test.ts')).toEqual(
      [],
    );
  });
});

describe('CoreImportScanner — код канала не знает тесты, себя по имени и каркас бота', () => {
  const CHANNEL = 'packages/chat-ui/src/dialog/dialog-channel.ts';

  for (const text of [
    "import { a } from 'dmg-ui/testing';",
    "import { a } from 'dmg-ui/chat-ui';",
    "import { a } from 'dmg-ui/tg-bot';",
  ]) {
    it(`${text} в канале — нарушение`, () => {
      expect(scan(text, CHANNEL)).toHaveLength(1);
    });
  }
});

describe('CoreImportScanner — тестовый вход канала (packages/chat-ui/testing/)', () => {
  const BINDING = 'packages/chat-ui/testing/example/example-dialog.arch.ts';

  it('разрешены граф, сборка ArchApp, пример, канал по имени входа и соседи', () => {
    const text = [
      "import * as v from 'valibot';",
      "import { F } from 'dmg-core';",
      "import type { GraphProvider } from 'dmg-core/graph';",
      "import type { ArchApp } from 'dmg-core/arch';",
      "import { ExampleArch } from 'dmg-core/testing';",
      "import { ListTasksUcDef } from 'dmg-core/testing/example';",
      "import { ScreenDef } from 'dmg-ui';",
      "import { UI_EDGE_KINDS } from 'dmg-ui/graph';",
      "import { TaskListScreenDef } from 'dmg-ui/testing';",
      "import { DialogViews } from 'dmg-ui/chat-ui';",
      "import { TaskLines } from './task-lines';",
    ].join('\n');

    expect(scan(text, BINDING)).toEqual([]);
  });

  for (const text of [
    "import fs from 'node:fs';",
    "import { test } from 'bun:test';",
    "import { a } from 'dmg-ui/tg-bot';",
    "import { a } from 'dmg-ui/chat-ui/testing';",
    "import { a } from 'dmg-core/gen';",
    "import { a } from 'dmg-core/app';",
    "import { UiIds } from '../../../core/src/address/ui-ids';",
    "import { DialogViews } from '../../src/dialog/dialog-views';",
  ]) {
    it(`${text} в тестовом входе канала — нарушение`, () => {
      expect(scan(text, BINDING)).toHaveLength(1);
    });
  }

  it('*.test.ts тестового входа — вне зоны', () => {
    const text = "import { test } from 'bun:test';\nimport 'node:fs';";

    expect(scan(text, 'packages/chat-ui/testing/dialog-story.test.ts')).toEqual(
      [],
    );
  });
});

describe('CoreImportScanner — каркас Telegram-бота (packages/tg-bot/src/)', () => {
  const BOT = 'packages/tg-bot/src/bot.ts';

  it('разрешены valibot, dmg-core, dmg-ui, dmg-ui/chat-ui и соседи', () => {
    const text = [
      "import * as v from 'valibot';",
      "import { Trace } from 'dmg-core';",
      "import type { GraphProvider } from 'dmg-core/graph';",
      "import { ScreenRuntime } from 'dmg-ui';",
      "import { RenderFlags } from 'dmg-ui/server';",
      "import { UI_EDGE_KINDS } from 'dmg-ui/graph';",
      "import { DialogChannel } from 'dmg-ui/chat-ui';",
      "import { Handler } from './handler';",
    ].join('\n');

    expect(scan(text, BOT)).toEqual([]);
  });

  for (const text of [
    "import { Bot } from 'grammy';",
    "import fs from 'node:fs';",
    "import { test } from 'bun:test';",
    "import { a } from 'dmg-ui/testing';",
    "import { a } from 'dmg-ui/chat-ui/testing';",
    "import { a } from 'dmg-core/testing';",
    "import { a } from 'dmg-core/testing/example';",
    "import { DialogChannel } from '../../chat-ui/src/dialog/dialog-channel';",
    "import { UiIds } from '../../core/src/address/ui-ids';",
  ]) {
    it(`${text} в tg-bot — нарушение`, () => {
      expect(scan(text, BOT)).toHaveLength(1);
    });
  }

  it('*.test.ts каркаса — вне зоны', () => {
    const text = "import { test } from 'bun:test';\nimport 'node:fs';";

    expect(scan(text, 'packages/tg-bot/src/bot.test.ts')).toEqual([]);
  });
});

describe('CoreImportScanner — приёмочный каталог монорепо (acceptance/)', () => {
  const STORY = 'acceptance/channels-story.test.ts';

  it('входы по именам, включая chat-ui, его testing и fixtures, и тестовые модули проходят', () => {
    const text = [
      "import { describe, expect, it } from 'bun:test';",
      "import { ScreenRuntime } from 'dmg-ui';",
      "import { UiServer } from 'dmg-ui/server';",
      "import { ExampleUiSetDef } from 'dmg-ui/testing';",
      "import { DialogChannel } from 'dmg-ui/chat-ui';",
      "import { ExampleDialogArch } from 'dmg-ui/chat-ui/testing';",
      "import { T0 } from 'dmg-ui/testing/fixtures';",
      "import { ExampleArch } from 'dmg-core/testing';",
    ].join('\n');

    expect(scan(text, STORY)).toEqual([]);
  });

  it('*.test.ts приёмочного каталога тоже в зоне: путь в packages/ — нарушение', () => {
    const text =
      "import { DialogChannel } from '../packages/chat-ui/src/index';";

    expect(scan(text, STORY)).toHaveLength(1);
  });

  for (const text of [
    "import { a } from '../packages/core/src/index';",
    "import { a } from '../packages/chat-ui/testing/index';",
    "import { a } from '../packages/core/testing/fixtures';",
  ]) {
    it(`${text} в acceptance — нарушение`, () => {
      expect(scan(text, STORY)).toHaveLength(1);
    });
  }

  it('относительный импорт соседа внутри acceptance проходит', () => {
    expect(scan("import { a } from './helper';", STORY)).toEqual([]);
  });
});
