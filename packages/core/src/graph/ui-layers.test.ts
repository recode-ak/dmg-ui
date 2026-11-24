import { beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { type ArchApp, ArchChecker } from 'dmg-core/arch';
import { ExampleAppDef, useTempDir } from 'dmg-core/testing';
import { ExampleUiSetDef } from '../../testing/example';
import { ArchReport, UiScene } from '../../testing/ui-arch';
import { UiGraphProvider } from './ui-graph-provider';
import type { UiChannelSpec } from './ui-graph-provider.types';

// Мини-проект во временном каталоге `<base>`: проект — `<base>/proj`, реестр
// долга кода — `<base>/debt/code.md`, Место записи — от `<base>`. Набор —
// учебный (модули `todo` и `users`), приложений UI нет: правила графа по
// приложениям молчат. Файлы — по импорту на спецификатор; относительный
// импорт разрешается без файла-цели.

/** Каналы мини-проекта; имена нейтральны: в исходниках ядра нет слов канала. */
const CHANNELS: readonly UiChannelSpec[] = [
  { name: 'dialog' },
  { name: 'voice', base: 'dialog' },
  { name: 'site' },
];

const temp = useTempDir('dmg-ui-layers-');
let base: string;
let proj: string;

beforeEach(() => {
  base = realpathSync(temp().path);
  proj = join(base, 'proj');
  mkdirSync(proj);
  put('app.graph.ts');
});

/** Файл проекта: по импорту на спецификатор, в порядке аргументов. */
function put(path: string, ...specs: readonly string[]): void {
  const file = join(proj, path);
  mkdirSync(dirname(file), { recursive: true });
  const lines = specs.map((spec, i) => `import { v${i} } from '${spec}';`);
  writeFileSync(file, [...lines, 'export {};', ''].join('\n'));
}

/** Реестр `<base>/debt/code.md` с одной записью `C-DEBT-1` на канал `dialog` модуля `todo`. */
function registry(rule: string): void {
  mkdirSync(join(base, 'debt'));
  writeFileSync(
    join(base, 'debt', 'code.md'),
    [
      '# Долг кода',
      '**Последний выданный ID:** `C-DEBT-1`',
      [
        '### C-DEBT-1: отступление от правила слоя фронта',
        '- **Место:** `proj/frontend/todo/dialog/**`',
        `- **Правило:** \`${rule}\``,
        '- **Признак:** `импорт чужого модуля канала`',
        '- **Корень:** `proj/frontend/**`',
        '- **Причина:** карточка пользователя нужна до входа модуля.',
        '- **Триггер:** вход public.ts у модуля users.',
      ].join('\n'),
    ].join('\n\n'),
  );
}

/** Каталоги фронта по раскладке мини-проекта. */
const frontend = (...parts: readonly string[]): string =>
  join(proj, 'frontend', ...parts);

/** Мини-проект без `layout`: домен — пакет, слои фреймворка — только раннер. */
const miniApp = (over: Partial<ArchApp> = {}): ArchApp => ({
  def: ExampleAppDef,
  providers: [
    new UiGraphProvider({
      set: ExampleUiSetDef,
      apps: [],
      channels: CHANNELS,
    }),
  ],
  project: proj,
  runners: [join(proj, 'runners', 'shell')],
  layers: {
    ui: [join(proj, 'platform', 'ui')],
    'fe-app': [frontend('app')],
    'fe-logic': [frontend('{m}', 'logic')],
    'fe-dialog': [frontend('{m}', 'dialog')],
    'fe-voice': [frontend('{m}', 'voice')],
    'fe-site': [frontend('{m}', 'site')],
    'dialog-kit': [frontend('dialog-kit')],
    'voice-kit': [frontend('voice-kit')],
    'site-kit': [frontend('site-kit')],
  },
  graphEntry: join(proj, 'app.graph.ts'),
  ...over,
});

/** Вариант с `layout`: каталоги домена и бэка в проекте, вход модуля домена — `contract.ts`. */
const layoutApp = (): ArchApp =>
  miniApp({
    entry: 'contract',
    layout: {
      kernel: join(proj, 'platform', 'kernel'),
      domain: join(proj, 'platform', 'domain', '{m}'),
      backend: join(proj, 'backend', '{m}'),
      assembly: join(proj, 'runners', 'assembly'),
    },
  });

/**
 * Строки нарушений, чей файл — один из `files` (пути от проекта), в порядке
 * аргументов: шум проверок без файла (ARC-13 слоёв, файлы модулей, правила
 * набора) не попадает.
 */
function linesOf(app: ArchApp, ...files: readonly string[]): string[] {
  const found = ArchChecker.of(app).check();
  return files.flatMap((file) =>
    found.filter((v) => v.file === join(proj, file)).map((v) => v.format()),
  );
}

/** Строки ARC-12 реестра отступлений. */
function deviationsOf(app: ArchApp): string[] {
  return ArchChecker.of(app)
    .check()
    .filter((v) => v.rule === 'ARC-12')
    .map((v) => v.format());
}

const UI = 'platform/ui/screen.ts';
const APP = 'frontend/app/shell.ts';
const LOGIC = 'frontend/todo/logic/tasks.ts';
const DIALOG = 'frontend/todo/dialog/list.ts';
const VOICE = 'frontend/todo/voice/menu.ts';
const KIT = 'frontend/dialog-kit/parts.ts';
const RUNNER = 'runners/shell/main.ts';

describe('слои фронта: описание ui', () => {
  it('ui импортирует код модуля, канал, kit, общее фронта и раннер — UI-28 на каждый импорт', () => {
    put(
      UI,
      '../../frontend/todo/logic/tasks',
      '../../frontend/todo/dialog/list',
      '../../frontend/dialog-kit/parts',
      '../../frontend/app/shell',
      '../../runners/shell/main',
    );
    expect(linesOf(miniApp(), UI)).toEqual([
      'UI-28: platform/ui/screen.ts (ui) импортирует fe-logic todo: ../../frontend/todo/logic/tasks',
      'UI-28: platform/ui/screen.ts (ui) импортирует fe-dialog todo: ../../frontend/todo/dialog/list',
      'UI-28: platform/ui/screen.ts (ui) импортирует dialog-kit: ../../frontend/dialog-kit/parts',
      'UI-28: platform/ui/screen.ts (ui) импортирует fe-app: ../../frontend/app/shell',
      'UI-28: platform/ui/screen.ts (ui) импортирует runner: ../../runners/shell/main',
    ]);
  });
});

describe('слои фронта: общее фронта fe-app', () => {
  it('fe-app импортирует ui — без нарушений', () => {
    put(APP, '../../platform/ui/screen');
    expect(linesOf(miniApp(), APP)).toEqual([]);
  });

  it('fe-app импортирует код модуля, kit и раннер — UI-29', () => {
    put(
      APP,
      '../todo/logic/tasks',
      '../dialog-kit/parts',
      '../../runners/shell/main',
    );
    expect(linesOf(miniApp(), APP)).toEqual([
      'UI-29: frontend/app/shell.ts (fe-app) импортирует fe-logic todo: ../todo/logic/tasks',
      'UI-29: frontend/app/shell.ts (fe-app) импортирует dialog-kit: ../dialog-kit/parts',
      'UI-29: frontend/app/shell.ts (fe-app) импортирует runner: ../../runners/shell/main',
    ]);
  });
});

describe('слои фронта: код модуля fe-logic', () => {
  it('fe-logic todo: любой файл своего модуля, ui и fe-app — без нарушений', () => {
    put('frontend/todo/logic/inner/sort.ts');
    put(
      LOGIC,
      './inner/sort',
      '../../../platform/ui/screen',
      '../../app/shell',
    );
    expect(linesOf(miniApp(), LOGIC)).toEqual([]);
  });

  it('fe-logic todo импортирует код модуля users, свой канал и kit — UI-30', () => {
    put(
      LOGIC,
      '../../users/logic/index',
      '../dialog/list',
      '../../dialog-kit/parts',
    );
    expect(linesOf(miniApp(), LOGIC)).toEqual([
      'UI-30: frontend/todo/logic/tasks.ts (fe-logic) импортирует fe-logic users: ../../users/logic/index',
      'UI-30: frontend/todo/logic/tasks.ts (fe-logic) импортирует fe-dialog todo: ../dialog/list',
      'UI-30: frontend/todo/logic/tasks.ts (fe-logic) импортирует dialog-kit: ../../dialog-kit/parts',
    ]);
  });
});

describe('слои фронта: канал модуля fe-<канал>', () => {
  it('fe-dialog todo видит свой модуль, свой код, ui, fe-app, свой kit и public.ts чужого модуля; fe-voice — базу и её kit', () => {
    put('frontend/todo/dialog/parts/row.ts');
    put(
      DIALOG,
      './parts/row',
      '../logic/tasks',
      '../../../platform/ui/screen',
      '../../app/shell',
      '../../dialog-kit/parts',
      '../../users/dialog/public',
    );
    put(VOICE, '../dialog/list', '../../dialog-kit/parts');
    expect(linesOf(miniApp(), DIALOG, VOICE)).toEqual([]);
  });

  it('fe-dialog todo импортирует код users, другой канал и его kit; fe-voice — канал-базу users — UI-31', () => {
    put(
      DIALOG,
      '../../users/logic/index',
      '../site/home',
      '../../site-kit/form',
      '../voice/menu',
    );
    put(VOICE, '../../users/dialog/public');
    expect(linesOf(miniApp(), DIALOG, VOICE)).toEqual([
      'UI-31: frontend/todo/dialog/list.ts (fe-dialog) импортирует fe-logic users — виден только свой модуль: ../../users/logic/index',
      'UI-31: frontend/todo/dialog/list.ts (fe-dialog) импортирует fe-site todo: ../site/home',
      'UI-31: frontend/todo/dialog/list.ts (fe-dialog) импортирует site-kit: ../../site-kit/form',
      'UI-31: frontend/todo/dialog/list.ts (fe-dialog) импортирует fe-voice todo: ../voice/menu',
      'UI-31: frontend/todo/voice/menu.ts (fe-voice) импортирует fe-dialog users — виден только свой модуль: ../../users/dialog/public',
    ]);
  });

  it('fe-dialog todo импортирует файл канала users мимо public.ts, реестра нет — UI-32', () => {
    put(DIALOG, '../../users/dialog/user-card.view');
    expect(linesOf(miniApp(), DIALOG)).toEqual([
      'UI-32: frontend/todo/dialog/list.ts (fe-dialog) импортирует fe-dialog users мимо public.ts: ../../users/dialog/user-card.view',
    ]);
  });
});

describe('слои фронта: цепочка баз каналов', () => {
  /** Цепочка `c` → `b` → `a`: у каждого канала — только прямая база. */
  const chainApp = (): ArchApp =>
    miniApp({
      providers: [
        new UiGraphProvider({
          set: ExampleUiSetDef,
          apps: [],
          channels: [
            { name: 'a' },
            { name: 'b', base: 'a' },
            { name: 'c', base: 'b' },
          ],
        }),
      ],
      layers: {
        ui: [join(proj, 'platform', 'ui')],
        'fe-app': [frontend('app')],
        'fe-logic': [frontend('{m}', 'logic')],
        'fe-a': [frontend('{m}', 'a')],
        'fe-b': [frontend('{m}', 'b')],
        'fe-c': [frontend('{m}', 'c')],
        'a-kit': [frontend('a-kit')],
        'b-kit': [frontend('b-kit')],
        'c-kit': [frontend('c-kit')],
      },
    });

  it('fe-c todo видит базу fe-b, но не базу базы fe-a — UI-31', () => {
    const file = 'frontend/todo/c/list.ts';
    put(file, '../b/list', '../a/list');
    expect(linesOf(chainApp(), file)).toEqual([
      'UI-31: frontend/todo/c/list.ts (fe-c) импортирует fe-a todo: ../a/list',
    ]);
  });
});

describe('слои фронта: общее канала <канал>-kit', () => {
  it('dialog-kit видит ui и fe-app, voice-kit — kit базы — без нарушений', () => {
    put(KIT, '../../platform/ui/screen', '../app/shell');
    put('frontend/voice-kit/prompts.ts', '../dialog-kit/parts');
    expect(linesOf(miniApp(), KIT, 'frontend/voice-kit/prompts.ts')).toEqual(
      [],
    );
  });

  it('dialog-kit импортирует канал и код модуля, kit другого канала — UI-33', () => {
    put(
      KIT,
      '../todo/dialog/list',
      '../todo/logic/tasks',
      '../voice-kit/prompts',
      '../site-kit/form',
    );
    expect(linesOf(miniApp(), KIT)).toEqual([
      'UI-33: frontend/dialog-kit/parts.ts (dialog-kit) импортирует fe-dialog todo: ../todo/dialog/list',
      'UI-33: frontend/dialog-kit/parts.ts (dialog-kit) импортирует fe-logic todo: ../todo/logic/tasks',
      'UI-33: frontend/dialog-kit/parts.ts (dialog-kit) импортирует voice-kit: ../voice-kit/prompts',
      'UI-33: frontend/dialog-kit/parts.ts (dialog-kit) импортирует site-kit: ../site-kit/form',
    ]);
  });
});

describe('слои фронта: раннер', () => {
  it('раннер видит ui, fe-app, kit и index.ts кода и канала модуля — без нарушений', () => {
    put(
      RUNNER,
      '../../platform/ui/screen',
      '../../frontend/app/shell',
      '../../frontend/dialog-kit/parts',
      '../../frontend/todo/logic/index',
      '../../frontend/todo/dialog/index',
    );
    expect(linesOf(miniApp(), RUNNER)).toEqual([]);
  });

  it('раннер импортирует файл кода или канала модуля мимо index.ts, в том числе public.ts — UI-34', () => {
    put(
      RUNNER,
      '../../frontend/todo/logic/tasks',
      '../../frontend/todo/dialog/list',
      '../../frontend/todo/dialog/public',
    );
    expect(linesOf(miniApp(), RUNNER)).toEqual([
      'UI-34: runners/shell/main.ts (runner) импортирует fe-logic todo мимо index.ts: ../../frontend/todo/logic/tasks',
      'UI-34: runners/shell/main.ts (runner) импортирует fe-dialog todo мимо index.ts: ../../frontend/todo/dialog/list',
      'UI-34: runners/shell/main.ts (runner) импортирует fe-dialog todo мимо index.ts: ../../frontend/todo/dialog/public',
    ]);
  });
});

describe('слои фронта: платформа приложения в проекте (layout)', () => {
  it('ui, fe-app, канал модуля и kit видят kernel и contract.ts модуля домена — без нарушений', () => {
    put(UI, '../kernel/clock', '../domain/todo/contract');
    put(
      APP,
      '../../platform/kernel/clock',
      '../../platform/domain/todo/contract',
    );
    put(
      DIALOG,
      '../../../platform/kernel/clock',
      '../../../platform/domain/todo/contract',
    );
    put(
      KIT,
      '../../platform/kernel/clock',
      '../../platform/domain/todo/contract',
    );
    expect(linesOf(layoutApp(), UI, APP, DIALOG, KIT)).toEqual([]);
  });

  it('fe-logic видит contract.ts модуля домена, другой файл домена — UI-30 мимо contract.ts', () => {
    put(
      LOGIC,
      '../../../platform/domain/todo/contract',
      '../../../platform/domain/todo/task.ar',
    );
    expect(linesOf(layoutApp(), LOGIC)).toEqual([
      'UI-30: frontend/todo/logic/tasks.ts (fe-logic) импортирует domain todo мимо contract.ts: ../../../platform/domain/todo/task.ar',
    ]);
  });
});

describe('сквозной: слои фронта вместе со слоями dmg-core (layout)', () => {
  it('фронт импортирует бэк — нарушение с ID слоя-импортёра', () => {
    put(UI, '../../backend/todo/task.repo');
    put(APP, '../../backend/app/clock');
    put(LOGIC, '../../../backend/todo/task.repo');
    put(DIALOG, '../../../backend/app/clock');
    put(KIT, '../../backend/todo/task.repo');
    expect(linesOf(layoutApp(), UI, APP, LOGIC, DIALOG, KIT)).toEqual([
      'UI-28: platform/ui/screen.ts (ui) импортирует backend todo: ../../backend/todo/task.repo',
      'UI-29: frontend/app/shell.ts (fe-app) импортирует backend-app: ../../backend/app/clock',
      'UI-30: frontend/todo/logic/tasks.ts (fe-logic) импортирует backend todo: ../../../backend/todo/task.repo',
      'UI-31: frontend/todo/dialog/list.ts (fe-dialog) импортирует backend-app: ../../../backend/app/clock',
      'UI-33: frontend/dialog-kit/parts.ts (dialog-kit) импортирует backend todo: ../../backend/todo/task.repo',
    ]);
  });

  it('бэк импортирует фронт — ARC-06, домен и kernel импортируют ui — ARC-02', () => {
    put('backend/todo/task.repo.ts', '../../frontend/todo/logic/tasks');
    put('backend/app/clock.ts', '../../frontend/app/shell');
    put('platform/domain/todo/task.ar.ts', '../../ui/screen');
    put('platform/kernel/clock.ts', '../ui/screen');
    expect(
      linesOf(
        layoutApp(),
        'backend/todo/task.repo.ts',
        'backend/app/clock.ts',
        'platform/domain/todo/task.ar.ts',
        'platform/kernel/clock.ts',
      ),
    ).toEqual([
      'ARC-06: backend/todo/task.repo.ts (backend) импортирует fe-logic todo: ../../frontend/todo/logic/tasks',
      'ARC-06: backend/app/clock.ts (backend-app) импортирует fe-app: ../../frontend/app/shell',
      'ARC-02: platform/domain/todo/task.ar.ts (domain) импортирует ui: ../../ui/screen',
      'ARC-02: platform/kernel/clock.ts (kernel) импортирует ui: ../ui/screen',
    ]);
  });
});

describe('слои фронта: отступления через долг кода проекта', () => {
  const debt = () => ({
    root: base,
    code: 'debt/code.md',
    idPrefix: 'C-DEBT',
  });

  it('чужой модуль канала мимо public.ts с записью Правило UI-32 — без нарушений', () => {
    put(DIALOG, '../../users/dialog/user-card.view');
    registry('UI-32');
    const app = miniApp({ debt: debt() });
    expect([...linesOf(app, DIALOG), ...deviationsOf(app)]).toEqual([]);
  });

  it('запись Правило UI-31 на импорт другого канала — UI-31 остаётся, ARC-12 «отступления не допускает»', () => {
    put(DIALOG, '../site/home');
    registry('UI-31');
    const app = miniApp({ debt: debt() });
    expect([...linesOf(app, DIALOG), ...deviationsOf(app)]).toEqual([
      'UI-31: frontend/todo/dialog/list.ts (fe-dialog) импортирует fe-site todo: ../site/home',
      'ARC-12: C-DEBT-1: правило UI-31 отступления не допускает — нарушение остаётся',
    ]);
  });
});

describe('слои фронта: сцена без домена', () => {
  it('сцена объявляет ui, fe-app и fe-logic — в отчёте arch:check нет ARC-13 и ARC-16', () => {
    const scene = new UiScene({ screens: [UiScene.screen('list')] });
    const app = scene.arch();
    const report = ArchReport.of(app);

    expect(Object.keys(app.layers ?? {}).toSorted()).toEqual([
      'fe-app',
      'fe-logic',
      'ui',
    ]);
    expect([...report.rule('ARC-13'), ...report.rule('ARC-16')]).toEqual([]);
  });
});
