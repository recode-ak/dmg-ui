import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { type ArchApp, ArchChecker } from 'dmg-core/arch';
import {
  ExampleAppDef,
  type FixtureManifest,
  Monorepo,
} from 'dmg-core/testing';
import { ExampleUiSetDef } from '../../testing/example';
import { UiGraphProvider } from './ui-graph-provider';

// Мини-монорепо на изолированной установке Bun: каждый слой фронта — свой
// пакет, `dmg-ui` — внешний пакет. Модули — учебные `todo` и `users`, канал —
// `dialog`, приложений UI нет. Вход графа — `runners/shell/src/app.graph.ts`,
// сборка реестров — `runners/shell/src/main.ts`. Фикстура пишется целиком до
// `install()` (кэш резолвера Bun), каждый тест — в своём каталоге.
let repo: Monorepo;

beforeEach(() => {
  repo = Monorepo.create();
});

afterEach(() => {
  repo.dispose();
});

const at = (path: string): string => join(repo.proj, path);

/** Пакеты по каталогам: имя, `exports`, зависимости. */
type Units = Record<string, FixtureManifest>;

/** Файлы проекта: путь → спецификаторы импортов. */
type Files = Record<string, readonly string[]>;

const MAIN = { '.': './src/index.ts' };
const WITH_PUBLIC = { ...MAIN, './public': './src/public.ts' };

const UNITS: Units = {
  'platform/ui': { name: '@t/ui', exports: MAIN, dependencies: ['dmg-ui'] },
  'frontend/app': {
    name: '@t/fe-app',
    exports: MAIN,
    dependencies: ['@t/ui', 'dmg-ui'],
  },
  'frontend/todo/logic': {
    name: '@t/fe-todo',
    exports: MAIN,
    dependencies: ['@t/ui', '@t/fe-app', 'dmg-ui'],
  },
  'frontend/users/logic': {
    name: '@t/fe-users',
    exports: MAIN,
    dependencies: ['@t/ui', 'dmg-ui'],
  },
  'frontend/todo/dialog': {
    name: '@t/fe-todo-dialog',
    exports: WITH_PUBLIC,
    dependencies: [
      '@t/fe-todo',
      '@t/ui',
      '@t/dialog-kit',
      '@t/fe-users-dialog',
      'dmg-ui',
    ],
  },
  'frontend/users/dialog': {
    name: '@t/fe-users-dialog',
    exports: WITH_PUBLIC,
    dependencies: ['@t/fe-users', '@t/ui', '@t/dialog-kit', 'dmg-ui'],
  },
  'frontend/dialog-kit': {
    name: '@t/dialog-kit',
    exports: MAIN,
    dependencies: ['@t/ui', 'dmg-ui'],
  },
  'runners/shell': {
    name: '@t/shell',
    exports: MAIN,
    dependencies: [
      '@t/ui',
      '@t/fe-app',
      '@t/fe-todo',
      '@t/fe-users',
      '@t/fe-todo-dialog',
      '@t/fe-users-dialog',
      '@t/dialog-kit',
      'dmg-ui',
    ],
  },
};

const GRAPH = 'runners/shell/src/app.graph.ts';
const LIST = 'frontend/todo/dialog/src/list.ts';

const FILES: Files = {
  'platform/ui/src/index.ts': ['dmg-ui'],
  'frontend/app/src/index.ts': [],
  'frontend/todo/logic/src/index.ts': ['@t/ui', '@t/fe-app'],
  'frontend/users/logic/src/index.ts': [],
  'frontend/todo/dialog/src/index.ts': ['@t/fe-todo', './list'],
  [LIST]: ['@t/ui', '@t/dialog-kit', '@t/fe-users-dialog/public'],
  'frontend/users/dialog/src/index.ts': [],
  'frontend/users/dialog/src/public.ts': [],
  'frontend/users/dialog/src/card.ts': [],
  'frontend/dialog-kit/src/index.ts': [],
  'runners/shell/src/index.ts': [],
  [GRAPH]: ['@t/ui', './todo.ui-app'],
  'runners/shell/src/todo.ui-app.ts': ['@t/ui'],
  'runners/shell/src/main.ts': [
    '@t/fe-todo',
    '@t/fe-users',
    '@t/fe-todo-dialog',
    '@t/fe-users-dialog',
    '@t/dialog-kit',
  ],
};

/** Пишет чистую раскладку с заменой пакетов и файлов из аргументов, затем ставит. */
function install(units: Units = {}, files: Files = {}): void {
  const all = { ...UNITS, ...units };
  repo
    .vendor('dmg-ui', { 'index.ts': 'export {};\n' }, { '.': './index.ts' })
    .root({ workspaces: Object.keys(all) });
  for (const [dir, manifest] of Object.entries(all)) repo.unit(dir, manifest);
  for (const [path, specs] of Object.entries({ ...FILES, ...files })) {
    repo.write(path, ...specs);
  }
  repo.install();
}

const app = (): ArchApp => ({
  def: ExampleAppDef,
  providers: [
    new UiGraphProvider({
      set: ExampleUiSetDef,
      apps: [],
      channels: [{ name: 'dialog' }],
    }),
  ],
  project: repo.proj,
  runners: [at('runners/shell/src')],
  layers: {
    ui: [at('platform/ui/src')],
    'fe-app': [at('frontend/app/src')],
    'fe-logic': [at('frontend/{m}/logic/src')],
    'fe-dialog': [at('frontend/{m}/dialog/src')],
    'dialog-kit': [at('frontend/dialog-kit/src')],
  },
  graphEntry: at(GRAPH),
});

const RULES = new Set([
  'ARC-13',
  'ARC-14',
  'ARC-15',
  'ARC-16',
  'UI-28',
  'UI-29',
  'UI-30',
  'UI-31',
  'UI-32',
  'UI-33',
  'UI-34',
]);

/**
 * Строки нарушений правил единиц и слоёв фронта; с `file` — только по этому
 * файлу (путь от проекта). Поля `file` у нарушений ARC-14/15 нет: файл — первое
 * слово текста строки.
 */
function linesOf(rule?: string, file?: string): string[] {
  return ArchChecker.of(app())
    .check()
    .filter((v) => (rule === undefined ? RULES.has(v.rule) : v.rule === rule))
    .map((v) => v.format())
    .filter(
      (line) => file === undefined || line.startsWith(`${rule}: ${file} `),
    );
}

describe('единица выноса фронта: monorepo на пакетах по слоям', () => {
  it('пакеты ui, fe-<m>, fe-<m>-<канал>, fe-app, <канал>-kit и оболочка; канал модуля берёт соседа через public, раннер — реестры через index — нарушений нет', () => {
    install();

    expect(linesOf()).toEqual([]);
  });

  it('описание объявляет реализацию фронта в dependencies — ARC-16', () => {
    install({
      'platform/ui': {
        ...UNITS['platform/ui'],
        dependencies: ['dmg-ui', '@t/fe-todo'],
      },
    });

    expect(linesOf('ARC-16')).toEqual([
      'ARC-16: platform/ui/package.json (@t/ui) объявляет @t/fe-todo — реализацию',
    ]);
  });

  it('вход графа доходит до представления модуля — ARC-16', () => {
    install({}, { [GRAPH]: ['@t/ui', './todo.ui-app', '@t/fe-todo-dialog'] });

    expect(linesOf('ARC-16')).toEqual([
      `ARC-16: вход графа ${GRAPH} доходит до реализации: ${GRAPH} импортирует fe-dialog todo: @t/fe-todo-dialog`,
    ]);
  });

  it('вход графа и сборка реестров в одном файле — ARC-16 на код и представления модулей', () => {
    install({}, { [GRAPH]: ['@t/ui', './todo.ui-app', './main'] });

    const via = `ARC-16: вход графа ${GRAPH} доходит до реализации: runners/shell/src/main.ts импортирует`;
    expect(linesOf('ARC-16')).toEqual([
      `${via} fe-logic todo: @t/fe-todo`,
      `${via} fe-logic users: @t/fe-users`,
      `${via} fe-dialog todo: @t/fe-todo-dialog`,
      `${via} fe-dialog users: @t/fe-users-dialog`,
      `${via} dialog-kit: @t/dialog-kit`,
    ]);
  });

  it('канал модуля импортирует чужой модуль мимо exports — ARC-15', () => {
    install(
      {},
      { [LIST]: ['@t/ui', '@t/dialog-kit', '@t/fe-users-dialog/src/card'] },
    );

    expect(linesOf('ARC-15', LIST)).toEqual([
      `ARC-15: ${LIST} (@t/fe-todo-dialog) импортирует @t/fe-users-dialog мимо exports (или пакет не установлен — bun install): @t/fe-users-dialog/src/card`,
    ]);
  });

  it('канал модуля импортирует пакет без записи в package.json — ARC-14', () => {
    install({
      'frontend/todo/dialog': {
        ...UNITS['frontend/todo/dialog'],
        dependencies: ['@t/fe-todo', '@t/ui', '@t/fe-users-dialog', 'dmg-ui'],
      },
    });

    expect(linesOf('ARC-14', LIST)).toEqual([
      `ARC-14: ${LIST} (@t/fe-todo-dialog) импортирует @t/dialog-kit — нет в package.json единицы: @t/dialog-kit`,
    ]);
  });
});
