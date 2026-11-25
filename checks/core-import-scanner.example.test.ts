import { describe, expect, it } from 'bun:test';
import { CoreImportScanner } from './core-import-scanner';
import { SourceFile } from './source-tree';

// Зоны учебного проекта `packages/example/src/` (D-UI-121): белые списки npm
// по месту. Описание и `logic` берут только то, что взял бы проект; виды
// каналов и kit — плюс публичный вход своего канала; раннеры — сборку
// приложения, файлы `ArchApp` — ещё граф и путь к входу графа. Относительные
// импорты между местами проекта держат слои (`LayerChecker`, UI-28…UI-34 в
// `example-*.arch.test.ts`), выход из пакета — `PackageDirections`. Запрет
// одного класса проверяется на одном представителе зоны; лишний путь зоны —
// только чтобы показать, что её `include` его охватывает.

const P = 'packages/example/src';

const scan = (text: string, path: string) =>
  CoreImportScanner.standard().scan([SourceFile.of(path, text)]);

/** Каждый спецификатор в файле — ровно одно нарушение. */
const eachViolates = (path: string, specs: readonly string[]) => {
  for (const spec of specs) {
    expect(scan(`import { a } from '${spec}';`, path)).toHaveLength(1);
  }
};

/** То, что берёт описание: схемы, ядро и контракты учебного приложения. */
const PROJECT = [
  "import * as v from 'valibot';",
  "import { F } from 'dmg-core';",
  "import { ScreenDef } from 'dmg-ui';",
  "import { ListTasksUcDef } from 'dmg-core/testing/example';",
];

/** Вход диалогового канала — у видов chat и telegram и у раннера dialog. */
const CHAT_ENTRY = "import { ChatViews } from 'dmg-ui/chat-ui';";

describe('CoreImportScanner — описание и logic учебного проекта', () => {
  const UI = `${P}/platform/ui/todo/shared/task-list.screen.ts`;

  it('разрешены valibot, dmg-core, dmg-ui, контракты dmg-core/testing/example и соседи', () => {
    const text = [...PROJECT, "import { taskRow } from './example-tasks';"];

    expect(scan(text.join('\n'), UI)).toEqual([]);
  });

  for (const spec of [
    'node:fs',
    'dmg-core/app',
    'dmg-core/graph',
    'dmg-core/testing',
    'dmg-ui/chat-ui',
  ]) {
    it(`«${spec}» в описании — нарушение`, () => {
      expect(scan(`import { a } from '${spec}';`, UI)).toHaveLength(1);
    });
  }

  for (const path of [
    `${P}/frontend/todo/logic/shared/task-list.scode.ts`,
    `${P}/frontend/users/logic/view-user/user-card.scode.ts`,
    `${P}/runners/example-codes.ts`,
  ]) {
    it(`${path}: как описание — набор проекта чист, среда и канал — нарушения`, () => {
      expect(scan(PROJECT.join('\n'), path)).toEqual([]);
      eachViolates(path, ['node:fs', 'dmg-ui/chat-ui']);
    });
  }

  it('тест рядом с кодом logic вне зоны: берёт тестовые входы', () => {
    const text = "import { RuntimeKit } from 'dmg-ui/testing/fixtures';";

    expect(
      scan(text, `${P}/frontend/todo/logic/shared/task-list.scode.test.ts`),
    ).toEqual([]);
  });
});

describe('CoreImportScanner — виды каналов chat и telegram учебного проекта', () => {
  const CHAT = `${P}/frontend/todo/chat/shared/task-list.view.ts`;
  const TELEGRAM = `${P}/frontend/todo/telegram/shared/task-list.view.ts`;

  it('вид chat: описание, ядро и вход диалогового канала — чисто', () => {
    expect(scan([...PROJECT, CHAT_ENTRY].join('\n'), CHAT)).toEqual([]);
  });

  for (const spec of [
    'node:fs',
    'dmg-ui/server',
    'dmg-ui/chat-ui/testing',
    'dmg-ui/tg-bot',
    'dmg-ui/web-ui',
  ]) {
    it(`«${spec}» в виде chat — нарушение`, () => {
      expect(scan(`import { a } from '${spec}';`, CHAT)).toHaveLength(1);
    });
  }

  it('вид telegram: плюс вход своего канала dmg-ui/tg-bot — чисто', () => {
    const text = [
      ...PROJECT,
      CHAT_ENTRY,
      "import { TELEGRAM_CAPABILITIES } from 'dmg-ui/tg-bot';",
    ];

    expect(scan(text.join('\n'), TELEGRAM)).toEqual([]);
  });

  for (const spec of ['node:fs', 'dmg-ui/web-ui', 'dmg-ui/chat-ui/testing']) {
    it(`«${spec}» в виде telegram — нарушение`, () => {
      expect(scan(`import { a } from '${spec}';`, TELEGRAM)).toHaveLength(1);
    });
  }

  it('chat-kit — зона вида chat, telegram-kit — зона вида telegram', () => {
    const chatKit = `${P}/frontend/chat-kit/x.ts`;
    const telegramKit = `${P}/frontend/telegram-kit/example-moment.const.ts`;

    expect(scan(CHAT_ENTRY, chatKit)).toEqual([]);
    eachViolates(chatKit, ['dmg-ui/tg-bot']);
    expect(scan("import { a } from 'dmg-ui/tg-bot';", telegramKit)).toEqual([]);
    eachViolates(telegramKit, ['dmg-ui/web-ui']);
  });
});

describe('CoreImportScanner — раннеры dialog и tg-bot учебного проекта', () => {
  const DIALOG = `${P}/runners/dialog/example-dialog.ui-app.ts`;
  const TG = `${P}/runners/tg-bot/example-bot.ts`;

  it('раннер dialog: сборка приложения диалога и тестовые входы — чисто', () => {
    const text = [
      ...PROJECT,
      CHAT_ENTRY,
      "import { ExampleArch } from 'dmg-core/testing';",
      "import { todoChatViews } from '../../frontend/todo/chat';",
    ];

    expect(scan(text.join('\n'), DIALOG)).toEqual([]);
  });

  for (const spec of ['node:fs', 'dmg-core/app', 'dmg-ui/web-ui']) {
    it(`«${spec}» в раннере dialog — нарушение`, () => {
      expect(scan(`import { a } from '${spec}';`, DIALOG)).toHaveLength(1);
    });
  }

  it('раннер tg-bot: среда, бот, платформа приложения и тестовые входы — чисто', () => {
    const text = [
      "import { readFile } from 'node:fs/promises';",
      "import { Bot } from 'grammy';",
      "import { App } from 'dmg-core/app';",
      "import { ExampleApp } from 'dmg-core/testing/example';",
      "import { UiServer } from 'dmg-ui/server';",
      "import { TgChannel } from 'dmg-ui/tg-bot';",
      "import { MemoryBotApi } from 'dmg-ui/tg-bot/testing';",
      "import { ExampleLimits } from 'dmg-ui/chat-ui/testing';",
    ];

    expect(scan(text.join('\n'), TG)).toEqual([]);
  });

  for (const spec of ['dmg-ui/web-ui', 'react']) {
    it(`«${spec}» в раннере tg-bot — нарушение`, () => {
      expect(scan(`import { a } from '${spec}';`, TG)).toHaveLength(1);
    });
  }
});

describe('CoreImportScanner — файлы ArchApp раннеров учебного проекта', () => {
  const GRAPH_ENTRY = `${P}/runners/web/example-web.graph.ts`;

  for (const path of [
    `${P}/runners/dialog/example-dialog.arch.ts`,
    GRAPH_ENTRY,
    `${P}/runners/example-arch.const.ts`,
  ]) {
    it(`${path}: путь к входу графа, граф, сборка ArchApp и поставщики каналов — чисто`, () => {
      const text = [
        "import { join } from 'node:path';",
        "import type { ArchApp } from 'dmg-core/arch';",
        "import type { GraphApp } from 'dmg-core/graph';",
        "import { ExampleAppDef } from 'dmg-core/testing';",
        "import { UiGraphProvider } from 'dmg-ui/graph';",
        "import { MemoryMessenger } from 'dmg-ui/chat-ui/testing';",
        "import { PageGraphProvider } from 'dmg-ui/web-ui';",
      ];

      expect(scan(text.join('\n'), path)).toEqual([]);
    });
  }

  for (const spec of ['node:fs', 'dmg-core/app', 'dmg-ui/tg-bot']) {
    it(`«${spec}» в файле ArchApp — нарушение`, () => {
      expect(scan(`import { a } from '${spec}';`, GRAPH_ENTRY)).toHaveLength(1);
    });
  }

  it('файл ArchApp не видит DOM-клиент web', () => {
    expect(
      scan("import { a } from './client/main';", GRAPH_ENTRY),
    ).toHaveLength(1);
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
    "import { exampleCodes } from 'dmg-ui/example';",
    "import fs from 'node:fs';",
  ]) {
    it(`${text} в помощнике — нарушение`, () => {
      expect(scan(text, PREVIEW)).toHaveLength(1);
    });
  }
});
