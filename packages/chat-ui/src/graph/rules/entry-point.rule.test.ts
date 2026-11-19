import { describe, expect, test } from 'bun:test';
import type { ArchApp } from 'dmg-core/arch';
import {
  AppGraph,
  Graph,
  type GraphContribution,
  type GraphProvider,
  type GraphRule,
} from 'dmg-core/graph';
import { ExampleArch } from 'dmg-core/testing';
import { UiGraphProvider } from 'dmg-ui/graph';
import { ExampleUiSetDef, exampleCodes } from 'dmg-ui/testing';
import { ArchReport } from 'dmg-ui/testing/fixtures';
import {
  ExampleDialogAppDef,
  ExampleWindowedAppDef,
  exampleDialogViews,
  MemoryMessenger,
} from '../../../testing';
import { ChatExamples } from '../chat-examples';
import { type ChatAppSpec, ChatGraphProvider } from '../chat-graph-provider';

// CH-02: у каждого входа беседы приложения (`chatEntry`) есть входящее ребро
// `chatOpens` от точки входа (`chatEntryPoint`). Правило читает только узлы
// и рёбра; `via` и `key` точки — слова пакета мессенджера, `chat-ui` их не
// трактует, поэтому в сценах они нейтральные.

const EDITING = MemoryMessenger.editing().capabilities;
const WINDOWED = MemoryMessenger.windowed(() => 0).capabilities;

const EXAMPLES = await ChatExamples.collect({
  set: ExampleUiSetDef,
  codes: exampleCodes(),
});

/** Точка входа на вход `entry`. */
const point = (entry: string, key = entry) => ({
  entry,
  via: 'message',
  key,
});

const dialog = (entryPoints?: ChatAppSpec['entryPoints']): ChatAppSpec => ({
  app: ExampleDialogAppDef,
  views: exampleDialogViews,
  capabilities: EDITING,
  ...(entryPoints ? { entryPoints } : {}),
});

const windowed = (entryPoints?: ChatAppSpec['entryPoints']): ChatAppSpec => ({
  app: ExampleWindowedAppDef,
  views: exampleDialogViews,
  capabilities: WINDOWED,
  ...(entryPoints ? { entryPoints } : {}),
});

/**
 * Сцена: домен примера, поставщик `dmg-ui`, `ChatGraphProvider` на `apps` и
 * подставные поставщики `extra` — реестр видов общий, они ставят узлы и
 * рёбра видов `dmg-ui-chat` через сборщик графа, как пакет мессенджера.
 */
const sceneOf = (
  apps: readonly ChatAppSpec[],
  extra: readonly GraphProvider[] = [],
): ArchApp => ({
  ...ExampleArch,
  providers: [
    new UiGraphProvider({
      set: ExampleUiSetDef,
      apps: apps.map((spec) => spec.app),
    }),
    new ChatGraphProvider({ apps, examples: EXAMPLES }),
    ...extra,
  ],
});

/** Подставной поставщик сцены без своих видов: только узлы и рёбра. */
const stub = (contribution: GraphContribution): GraphProvider => ({
  name: 'scene-stub',
  version: '1.0.0',
  kinds: () => ({ nodes: [], edges: [] }),
  contribute: () => contribution,
});

/** Ребро `chatOpens` от `from` на вход `assigned` приложения `exampleDialog`. */
const opensAssigned = (from: string) => ({
  kind: 'chatOpens',
  from,
  to: 'exampleDialog/enter-assigned',
});

/** Узел `chatEntryPoint` на вход `assigned` с `id` `id`. */
const pointNode = (id: string) => ({
  kind: 'chatEntryPoint',
  id,
  label: 'Точка сцены',
  description: 'Точка входа подставного поставщика.',
  props: { entry: 'assigned', via: 'message', key: 'assigned' },
});

/** Правило CH-02 поставщика сцены. */
const ruleOf = (scene: ArchApp): GraphRule | undefined =>
  (scene.providers ?? [])
    .find((provider) => provider instanceof ChatGraphProvider)
    ?.rules?.()
    .find((rule) => rule.id === 'CH-02');

describe('CH-02: у входа приложения есть точка входа', () => {
  test('вход assigned без точки входа — код 1 и строка CH-02 с входом и приложением', () => {
    const report = ArchReport.of(
      sceneOf([dialog([point('start'), point('menu')])]),
    );

    expect(report.code).toBe(1);
    expect(report.rule('CH-02')).toEqual([
      'CH-02: вход assigned приложения exampleDialog: нет точки входа',
    ]);
  });

  test('приложение без entryPoints — строка CH-02 на каждый вход', () => {
    const report = ArchReport.of(sceneOf([dialog()]));

    expect(report.code).toBe(1);
    expect([...report.rule('CH-02')].sort()).toEqual([
      'CH-02: вход assigned приложения exampleDialog: нет точки входа',
      'CH-02: вход menu приложения exampleDialog: нет точки входа',
      'CH-02: вход start приложения exampleDialog: нет точки входа',
    ]);
  });

  test('все входы с точками — CH-02 молчит, код 0', () => {
    const report = ArchReport.of(
      sceneOf([dialog([point('start'), point('assigned'), point('menu')])]),
    );

    expect(report.rule('CH-02')).toEqual([]);
    expect(report.code).toBe(0);
  });

  test('две точки на один вход — CH-02 молчит', () => {
    const report = ArchReport.of(
      sceneOf([
        dialog([
          point('start'),
          point('start', 'again'),
          point('assigned'),
          point('menu'),
        ]),
      ]),
    );

    expect(report.rule('CH-02')).toEqual([]);
    expect(report.code).toBe(0);
  });
});

describe('CH-02: два приложения в одном графе', () => {
  test('нарушение только у приложения без точки входа', () => {
    const report = ArchReport.of(
      sceneOf([
        dialog([point('start'), point('assigned'), point('menu')]),
        windowed(),
      ]),
    );

    expect(report.code).toBe(1);
    expect(report.rule('CH-02')).toEqual([
      'CH-02: вход start приложения exampleWindowed: нет точки входа',
    ]);
  });

  test('точки входа одного приложения не закрывают одноимённый вход другого', () => {
    const report = ArchReport.of(
      sceneOf([
        dialog([point('start'), point('menu')]),
        windowed([point('start')]),
      ]),
    );

    expect(report.rule('CH-02')).toEqual([
      'CH-02: вход assigned приложения exampleDialog: нет точки входа',
    ]);
  });
});

describe('CH-02: точка входа — под тем же приложением, что вход', () => {
  test('ребро chatOpens от точки входа другого приложения — вход без точки', () => {
    const report = ArchReport.of(
      sceneOf(
        [dialog([point('start'), point('menu')]), windowed([point('start')])],
        [
          stub({
            nodes: [],
            edges: [opensAssigned('exampleWindowed/point-start-1')],
          }),
        ],
      ),
    );

    expect(report.rule('CH-02')).toEqual([
      'CH-02: вход assigned приложения exampleDialog: нет точки входа',
    ]);
  });

  test('точка входа другого поставщика под тем же приложением — засчитывается', () => {
    const report = ArchReport.of(
      sceneOf(
        [dialog([point('start'), point('menu')])],
        [
          stub({
            nodes: [pointNode('exampleDialog/point-scene')],
            edges: [opensAssigned('exampleDialog/point-scene')],
          }),
        ],
      ),
    );

    expect(report.rule('CH-02')).toEqual([]);
    expect(report.code).toBe(0);
  });
});

describe('CH-02: читает только узлы и рёбра', () => {
  test('свойства chatEntry и chatEntryPoint не по схеме — check не бросает, строки те же, что у целого графа', () => {
    const scene = sceneOf([
      dialog([point('start'), point('menu')]),
      windowed([point('start')]),
    ]);
    const built = new AppGraph(scene).build();
    const rule = ruleOf(scene);
    // Сборщик графа проверяет свойства схемой вида и узлы не по схеме не
    // пропустит: сцена собирает граф конструктором `Graph` в обход него,
    // как граф с чужими правками. Другого пути к такому графу нет.
    const broken = new Graph({
      providers: built.providers,
      nodes: built
        .nodes()
        .map((node) =>
          node.kind === 'chatEntry' || node.kind === 'chatEntryPoint'
            ? { ...node, props: {} }
            : node,
        ),
      edges: built.edges(),
    });

    expect(rule).toBeDefined();
    let lines: readonly string[] = [];
    expect(() => {
      lines = rule?.check(broken) ?? [];
    }).not.toThrow();
    expect(lines).toEqual(rule?.check(built) ?? []);
    expect(lines).toEqual([
      'вход assigned приложения exampleDialog: нет точки входа',
    ]);
  });

  test('узел chatEntry не прямо под узлом приложения UI (в корне и под мессенджером) — CH-02 его не видит: строки те же, что без него', () => {
    const orphan = (id: string) => ({
      kind: 'chatEntry',
      id,
      label: 'Вход сцены',
      description: 'Вход подставного поставщика не под приложением.',
      props: { entry: 'orphan' },
    });
    const report = ArchReport.of(
      sceneOf(
        [dialog([point('start'), point('menu')])],
        [
          stub({
            nodes: [
              orphan('enter-orphan'),
              orphan('exampleDialog/messenger/enter-orphan'),
            ],
            edges: [],
          }),
        ],
      ),
    );

    expect(report.rule('ARC-13')).toEqual([]);
    expect(report.rule('CH-02')).toEqual([
      'CH-02: вход assigned приложения exampleDialog: нет точки входа',
    ]);
  });

  test('ребро chatOpens не от точки входа — вход без точки', () => {
    const report = ArchReport.of(
      sceneOf(
        [dialog([point('start'), point('menu')])],
        [
          stub({
            nodes: [],
            edges: [opensAssigned('exampleDialog/messenger')],
          }),
        ],
      ),
    );

    expect(report.rule('ARC-13')).toEqual([]);
    expect(report.rule('CH-02')).toEqual([
      'CH-02: вход assigned приложения exampleDialog: нет точки входа',
    ]);
  });
});
