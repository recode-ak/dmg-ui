import { describe, expect, test } from 'bun:test';
import type { ArchApp } from 'dmg-core/arch';
import { AppGraph, Graph, type GraphRule } from 'dmg-core/graph';
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

/** Сцена: домен примера, поставщик `dmg-ui` и `ChatGraphProvider` на `apps`. */
const sceneOf = (apps: readonly ChatAppSpec[]): ArchApp => ({
  ...ExampleArch,
  providers: [
    new UiGraphProvider({
      set: ExampleUiSetDef,
      apps: apps.map((spec) => spec.app),
    }),
    new ChatGraphProvider({ apps, examples: EXAMPLES }),
  ],
});

/** Правило CH-02 поставщика сцены. */
const ruleOf = (scene: ArchApp): GraphRule | undefined =>
  (scene.providers ?? [])
    .find((provider) => provider instanceof ChatGraphProvider)
    ?.rules?.()
    .find((rule) => rule.id === 'CH-02');

describe('CH-02: у входа приложения есть точка входа', () => {
  test('вход assigned без точки входа — код 1 и строка CH-02 с входом и приложением', () => {
    const report = ArchReport.of(sceneOf([dialog([point('start')])]));

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
      'CH-02: вход start приложения exampleDialog: нет точки входа',
    ]);
  });

  test('все входы с точками — CH-02 молчит, код 0', () => {
    const report = ArchReport.of(
      sceneOf([dialog([point('start'), point('assigned')])]),
    );

    expect(report.rule('CH-02')).toEqual([]);
    expect(report.code).toBe(0);
  });

  test('две точки на один вход — CH-02 молчит', () => {
    const report = ArchReport.of(
      sceneOf([
        dialog([point('start'), point('start', 'again'), point('assigned')]),
      ]),
    );

    expect(report.rule('CH-02')).toEqual([]);
    expect(report.code).toBe(0);
  });
});

describe('CH-02: два приложения в одном графе', () => {
  test('нарушение только у приложения без точки входа', () => {
    const report = ArchReport.of(
      sceneOf([dialog([point('start'), point('assigned')]), windowed()]),
    );

    expect(report.code).toBe(1);
    expect(report.rule('CH-02')).toEqual([
      'CH-02: вход start приложения exampleWindowed: нет точки входа',
    ]);
  });

  test('точки входа одного приложения не закрывают одноимённый вход другого', () => {
    const report = ArchReport.of(
      sceneOf([dialog([point('start')]), windowed([point('start')])]),
    );

    expect(report.rule('CH-02')).toEqual([
      'CH-02: вход assigned приложения exampleDialog: нет точки входа',
    ]);
  });
});

describe('CH-02: читает только узлы и рёбра', () => {
  // Сборщик графа проверяет свойства схемой вида — узлы не по схеме и вход
  // без приложения собираются конструктором `Graph` в обход него, как граф с
  // чужими правками.
  const scene = sceneOf([dialog([point('start')]), windowed([point('start')])]);
  const built = new AppGraph(scene).build();

  test('свойства chatEntry и chatEntryPoint не по схеме — check не бросает, строки те же, что у целого графа', () => {
    const rule = ruleOf(scene);
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

  test('узел chatEntry без узла приложения-родителя и без свойств — check не бросает, вывод — строки', () => {
    const rule = ruleOf(scene);
    const orphan = built.nodes().find((node) => node.kind === 'chatEntry');
    const broken = new Graph({
      providers: built.providers,
      nodes: [
        ...built.nodes(),
        ...(orphan ? [{ ...orphan, id: 'enter-orphan', props: {} }] : []),
      ],
      edges: built.edges(),
    });

    expect(rule).toBeDefined();
    expect(orphan).toBeDefined();
    let lines: readonly string[] = [];
    expect(() => {
      lines = rule?.check(broken) ?? [];
    }).not.toThrow();
    for (const line of lines) {
      expect(typeof line).toBe('string');
    }
  });

  test('ребро chatOpens не от точки входа — вход без точки', () => {
    const rule = ruleOf(scene);
    const broken = new Graph({
      providers: built.providers,
      nodes: built.nodes(),
      edges: [
        ...built.edges(),
        {
          kind: 'chatOpens',
          from: 'exampleDialog/messenger',
          to: 'exampleDialog/enter-assigned',
          provider: 'dmg-ui-chat',
          props: {},
        },
      ],
    });

    expect(rule?.check(broken)).toEqual([
      'вход assigned приложения exampleDialog: нет точки входа',
    ]);
  });
});
