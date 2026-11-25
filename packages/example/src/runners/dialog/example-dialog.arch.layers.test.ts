import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
} from 'bun:test';
import {
  cpSync,
  mkdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { type ArchApp, ArchChecker } from 'dmg-core/arch';
import { TempDir } from 'dmg-core/testing';
import { EXAMPLE_PLACES } from '../example-arch.const';
import { ExampleDialogGraph } from './example-dialog.graph';

// Слои фронта на копии учебного проекта (критерии 2 и 3): `<tmp>/example/src`
// — копия `src`, реестр долга — `<tmp>/debt/code.md`. Копия одна на файл
// (`useTempDir` дал бы каталог на тест), в каждом тесте — файл-зонд с одним
// импортом на спецификатор; зонд и реестр удаляются после теста. Места слоёв
// `EXAMPLE_PLACES` переносятся на корень копии здесь: код образца не меняется.
// «Фронт ↔ бэк» — мини-проект с `layout` (`dmg-ui` `packages/core/src/graph/ui-layers.test.ts`):
// у учебного проекта нет каталогов бэка.

let temp: TempDir;
let base: string;
let project: string;
const written: string[] = [];

beforeAll(() => {
  temp = TempDir.create('dmg-ui-example-copy-');
  base = realpathSync(temp.path);
  project = join(base, 'example');
  cpSync(join(EXAMPLE_PLACES.project, 'src'), join(project, 'src'), {
    recursive: true,
  });
});

afterEach(() => {
  for (const file of written.splice(0)) rmSync(file, { force: true });
  rmSync(join(base, 'debt'), { recursive: true, force: true });
});

afterAll(() => {
  temp.dispose();
});

/** Путь места образца — на корне копии. */
const moved = (path: string): string =>
  join(project, relative(EXAMPLE_PLACES.project, path));

/** Граф `dialog` на копии; `over` — поля сверх (реестр долга). */
const copyApp = (over: Partial<ArchApp> = {}): ArchApp => ({
  ...ExampleDialogGraph,
  project,
  runners: EXAMPLE_PLACES.runners.map(moved),
  layers: Object.fromEntries(
    Object.entries(EXAMPLE_PLACES.layers ?? {}).map(([layer, paths]) => [
      layer,
      paths.map(moved),
    ]),
  ),
  graphEntry: join(
    project,
    'src',
    'runners',
    'dialog',
    'example-dialog.graph.ts',
  ),
  ...over,
});

/** Файл-зонд копии (путь от проекта): по импорту на спецификатор. */
function probe(path: string, ...specs: readonly string[]): void {
  const file = join(project, path);
  mkdirSync(dirname(file), { recursive: true });
  const lines = specs.map((spec, i) => `import { v${i} } from '${spec}';`);
  writeFileSync(file, [...lines, 'export {};', ''].join('\n'));
  written.push(file);
}

/** Строки нарушений зонда `path`: шум копии вне зонда в проверку не входит. */
function linesOf(app: ArchApp, path: string): string[] {
  return ArchChecker.of(app)
    .check()
    .filter((v) => v.file === join(project, path))
    .map((v) => v.format());
}

/** Строки ARC-12 реестра отступлений. */
function deviationsOf(app: ArchApp): string[] {
  return ArchChecker.of(app)
    .check()
    .filter((v) => v.rule === 'ARC-12')
    .map((v) => v.format());
}

/** Реестр `<tmp>/debt/code.md`: запись `C-DEBT-1` на канал `chat` модуля `profile`. */
function registry(rule: string): void {
  mkdirSync(join(base, 'debt'));
  writeFileSync(
    join(base, 'debt', 'code.md'),
    [
      '# Долг кода',
      '**Последний выданный ID:** `C-DEBT-1`',
      [
        '### C-DEBT-1: отступление от правила слоя фронта',
        '- **Место:** `example/src/frontend/profile/chat/**`',
        `- **Правило:** \`${rule}\``,
        '- **Признак:** `импорт чужого модуля канала`',
        '- **Корень:** `example/src/frontend/**`',
        '- **Причина:** состояние учётной записи нужно до входа public.ts.',
        '- **Триггер:** кирпич AccountStatus во входе public.ts модуля users.',
      ].join('\n'),
    ].join('\n\n'),
  );
}

const UI_PROBE = 'src/platform/ui/profile/check-profile/probe.ts';
const LOGIC_PROBE = 'src/frontend/profile/logic/check-profile/probe.ts';
const CHAT_PROBE = 'src/frontend/profile/chat/check-profile/probe.ts';
const KIT_PROBE = 'src/frontend/web-kit/probe.ts';
const RUNNER_PROBE = 'src/runners/dialog/probe.ts';

describe('arch:check учебного проекта на копии — слои фронта', () => {
  test('K-01 описание импортирует реализацию модуля — UI-28', () => {
    probe(UI_PROBE, '../../../../frontend/profile/logic');

    expect(linesOf(copyApp(), UI_PROBE)).toEqual([
      `UI-28: ${UI_PROBE} (ui) импортирует fe-logic profile: ../../../../frontend/profile/logic`,
    ]);
  });

  test('K-02 код модуля импортирует код чужого модуля — UI-30', () => {
    probe(LOGIC_PROBE, '../../../users/logic');

    expect(linesOf(copyApp(), LOGIC_PROBE)).toEqual([
      `UI-30: ${LOGIC_PROBE} (fe-logic) импортирует fe-logic users: ../../../users/logic`,
    ]);
  });

  test('K-03 канал импортирует внутренности чужого модуля мимо public.ts — UI-32', () => {
    probe(CHAT_PROBE, '../../../users/chat/shared/account-status');

    expect(linesOf(copyApp(), CHAT_PROBE)).toEqual([
      `UI-32: ${CHAT_PROBE} (fe-chat) импортирует fe-chat users мимо public.ts: ../../../users/chat/shared/account-status`,
    ]);
  });

  test('K-04 канал импортирует код чужого модуля — UI-31', () => {
    probe(CHAT_PROBE, '../../../users/logic');

    expect(linesOf(copyApp(), CHAT_PROBE)).toEqual([
      `UI-31: ${CHAT_PROBE} (fe-chat) импортирует fe-logic users — виден только свой модуль: ../../../users/logic`,
    ]);
  });

  test('K-05 канал импортирует другой канал своего модуля — UI-31', () => {
    probe(CHAT_PROBE, '../../web');

    expect(linesOf(copyApp(), CHAT_PROBE)).toEqual([
      `UI-31: ${CHAT_PROBE} (fe-chat) импортирует fe-web profile: ../../web`,
    ]);
  });

  test('K-06 kit канала импортирует модуль — UI-33', () => {
    probe(KIT_PROBE, '../todo/web');

    expect(linesOf(copyApp(), KIT_PROBE)).toEqual([
      `UI-33: ${KIT_PROBE} (web-kit) импортирует fe-web todo: ../todo/web`,
    ]);
  });

  test('K-07 раннер берёт реестр и public.ts канала мимо index.ts — UI-34 на каждый импорт', () => {
    probe(
      RUNNER_PROBE,
      '../../frontend/todo/chat/todo-chat.views',
      '../../frontend/users/chat/public',
    );

    expect(linesOf(copyApp(), RUNNER_PROBE)).toEqual([
      `UI-34: ${RUNNER_PROBE} (runner) импортирует fe-chat todo мимо index.ts: ../../frontend/todo/chat/todo-chat.views`,
      `UI-34: ${RUNNER_PROBE} (runner) импортирует fe-chat users мимо index.ts: ../../frontend/users/chat/public`,
    ]);
  });

  test('K-08 канал мимо public.ts с записью долга «Правило: UI-32» — строк нет, ARC-12 молчит', () => {
    probe(CHAT_PROBE, '../../../users/chat/shared/account-status');
    registry('UI-32');
    const app = copyApp({
      debt: { root: base, code: 'debt/code.md', idPrefix: 'C-DEBT' },
    });

    expect([...linesOf(app, CHAT_PROBE), ...deviationsOf(app)]).toEqual([]);
  });
});
