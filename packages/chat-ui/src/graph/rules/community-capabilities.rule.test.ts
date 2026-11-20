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
import {
  GetTaskUcDef,
  RemoveUserUcDef,
  TaskEvents,
} from 'dmg-core/testing/example';
import { UiGraphProvider } from 'dmg-ui/graph';
import { ExampleUiSetDef, exampleCodes } from 'dmg-ui/testing';
import { ArchReport } from 'dmg-ui/testing/fixtures';
import {
  ExampleDialogUiAppDef,
  ExampleWindowedUiAppDef,
  exampleDialogViews,
  MemoryMessenger,
} from '../../../testing';
import type { ChatCommunitySpec } from '../../community/community.types';
import type { MessengerCapabilities } from '../../messenger/messenger.types';
import { ChatExamples } from '../chat-examples';
import { type ChatAppSpec, ChatGraphProvider } from '../chat-graph-provider';

// CH-03: сигнал (`chatSignal`) и реакция (`chatReaction`) прямо
// под приложением UI — только если мессенджер приложения (свойства узла
// `chatMessenger` того же приложения) принимает этот сигнал или исполняет
// эту операцию. `editing` умеет всё, у `windowed` возможности сообщества
// пустые — это сцена нарушения. Свойства не по схеме: CH-03 молчит, строку
// о возможностях даёт CH-01. Тексты — без данных манифеста (ERR-07).

const EDITING = MemoryMessenger.editing().capabilities;
const WINDOWED = MemoryMessenger.windowed(() => 0).capabilities;

const EXAMPLES = await ChatExamples.collect({
  set: ExampleUiSetDef,
  codes: exampleCodes(),
});

/** Сигнал `left` → `removeUser`. */
const GONE = {
  name: 'gone',
  label: 'Участник вышел',
  description: 'Участник вышел из группы — учётная запись удаляется.',
  signal: 'left',
  uc: RemoveUserUcDef,
  input: { userId: 'person' },
} as const;

/** Сигнал `joined` → `removeUser`: вид сигнала для мессенджера с частью возможностей. */
const CAME = { ...GONE, name: 'came', signal: 'joined' } as const;

/** Реакция на `todo.task.assigned`: `getTask` → исключить владельца задачи. */
const DROP = {
  name: 'drop',
  label: 'Исключить владельца',
  description: 'Владелец назначенной задачи исключается из группы.',
  event: TaskEvents.assigned,
  uc: GetTaskUcDef,
  input: { taskId: 'taskId' },
  operation: 'exclude',
  targets: { community: 'uuid', person: 'ownerId' },
} as const;

/** Реакция с операцией `invite`. */
const ASK = { ...DROP, name: 'ask', operation: 'invite' } as const;

const COMMUNITY: ChatCommunitySpec = { signals: [GONE], reactions: [DROP] };

/** По точке входа на каждый вход приложения (без неё CH-02 даёт код 1). */
const pointsOf = (app: ChatAppSpec['app']) =>
  Object.keys(app.entries).map((entry) => ({
    entry,
    via: 'message',
    key: entry,
  }));

const dialog = (
  community?: ChatCommunitySpec,
  capabilities: MessengerCapabilities = EDITING,
): ChatAppSpec => ({
  app: ExampleDialogUiAppDef,
  views: exampleDialogViews,
  capabilities,
  entryPoints: pointsOf(ExampleDialogUiAppDef),
  ...(community ? { community } : {}),
});

const windowed = (community?: ChatCommunitySpec): ChatAppSpec => ({
  app: ExampleWindowedUiAppDef,
  views: exampleDialogViews,
  capabilities: WINDOWED,
  entryPoints: pointsOf(ExampleWindowedUiAppDef),
  ...(community ? { community } : {}),
});

/**
 * Сцена: домен примера, поставщик `dmg-ui`, `ChatGraphProvider` на `apps`
 * и подставные поставщики `extra` — реестр видов общий, они ставят узлы
 * видов `dmg-ui-chat`, как пакет мессенджера.
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

/** Правило `id` поставщика `dmg-ui-chat` сцены. */
const ruleOf = (scene: ArchApp, id: string): GraphRule | undefined =>
  (scene.providers ?? [])
    .find((provider) => provider instanceof ChatGraphProvider)
    ?.rules?.()
    .find((rule) => rule.id === id);

const REACTION_LINE =
  'CH-03: приложение exampleWindowed: реакция exampleWindowed/reaction-drop (exclude) — мессенджер memory-windowed её не исполняет';
const SIGNAL_LINE =
  'CH-03: приложение exampleWindowed: сигнал exampleWindowed/signal-gone (left) — мессенджер memory-windowed его не принимает';

/** Строка правила без префикса `CH-03: ` — так её отдаёт `check`. */
const bare = (line: string) => line.slice('CH-03: '.length);

describe('CH-03: сигнал или реакция только в приложении мессенджера, который их умеет', () => {
  test('реакция exclude в exampleWindowed — код 1 и строка CH-03 о реакции', () => {
    const report = ArchReport.of(sceneOf([windowed({ reactions: [DROP] })]));

    expect(report.code).toBe(1);
    expect(report.rule('CH-03')).toEqual([REACTION_LINE]);
  });

  test('сигнал left в exampleWindowed — код 1 и строка CH-03 о сигнале', () => {
    const report = ArchReport.of(sceneOf([windowed({ signals: [GONE] })]));

    expect(report.code).toBe(1);
    expect(report.rule('CH-03')).toEqual([SIGNAL_LINE]);
  });

  test('сигнал и реакция в exampleWindowed — по строке на каждый', () => {
    const report = ArchReport.of(sceneOf([windowed(COMMUNITY)]));

    expect(report.code).toBe(1);
    expect([...report.rule('CH-03')].sort()).toEqual(
      [REACTION_LINE, SIGNAL_LINE].sort(),
    );
  });

  test('два приложения с одними манифестами — нарушение только у exampleWindowed', () => {
    const report = ArchReport.of(
      sceneOf([dialog(COMMUNITY), windowed(COMMUNITY)]),
    );

    expect(report.code).toBe(1);
    expect([...report.rule('CH-03')].sort()).toEqual(
      [REACTION_LINE, SIGNAL_LINE].sort(),
    );
  });

  test('exampleDialog на мессенджере, который всё умеет, с теми же манифестами — CH-03 молчит, код 0', () => {
    const report = ArchReport.of(sceneOf([dialog(COMMUNITY), windowed()]));

    expect(report.rule('CH-03')).toEqual([]);
    expect(report.code).toBe(0);
  });

  test('мессенджер с частью возможностей — строка только о сигнале и операции, которых нет в его списках', () => {
    const partial: MessengerCapabilities = {
      ...EDITING,
      name: 'memory-partial',
      community: { signals: ['joined'], operations: ['invite'] },
    };
    const report = ArchReport.of(
      sceneOf([
        dialog({ signals: [GONE, CAME], reactions: [DROP, ASK] }, partial),
      ]),
    );

    expect(report.code).toBe(1);
    expect([...report.rule('CH-03')].sort()).toEqual(
      [
        'CH-03: приложение exampleDialog: реакция exampleDialog/reaction-drop (exclude) — мессенджер memory-partial её не исполняет',
        'CH-03: приложение exampleDialog: сигнал exampleDialog/signal-gone (left) — мессенджер memory-partial его не принимает',
      ].sort(),
    );
  });

  test('без community у приложений — CH-03 молчит', () => {
    const report = ArchReport.of(sceneOf([dialog(), windowed()]));

    expect(report.rule('CH-03')).toEqual([]);
    expect(report.code).toBe(0);
  });
});

describe('CH-03: свойства и охват', () => {
  test('свойства chatMessenger не по схеме — check не бросает, CH-03 молчит, строку о возможностях даёт CH-01', () => {
    const scene = sceneOf([dialog(), windowed(COMMUNITY)]);
    const built = new AppGraph(scene).build();
    const rule = ruleOf(scene, 'CH-03');
    const limits = ruleOf(scene, 'CH-01');
    // Сборщик графа проверяет свойства схемой вида и узел не по схеме не
    // пропустит: сцена собирает граф конструктором `Graph` в обход него,
    // как граф с чужими правками. Другого пути к такому графу нет.
    const broken = new Graph({
      providers: built.providers,
      nodes: built
        .nodes()
        .map((node) =>
          node.kind === 'chatMessenger' && node.parent === 'exampleWindowed'
            ? { ...node, props: { name: 'сломанный' } }
            : node,
        ),
      edges: built.edges(),
    });

    expect(rule).toBeDefined();
    expect(rule?.check(built).length).toBe(2);
    let lines: readonly string[] = ['не вызван'];
    expect(() => {
      lines = rule?.check(broken) ?? ['не вызван'];
    }).not.toThrow();
    expect(lines).toEqual([]);
    expect(limits?.check(broken)).toEqual([
      'приложение exampleWindowed: возможности мессенджера не по схеме',
    ]);
  });

  test('свойства chatReaction не по схеме — check не бросает, о сломанной реакции строки нет, строка сигнала остаётся', () => {
    const scene = sceneOf([windowed(COMMUNITY)]);
    const built = new AppGraph(scene).build();
    const rule = ruleOf(scene, 'CH-03');
    // Граф в обход сборщика — как в сцене выше.
    const broken = new Graph({
      providers: built.providers,
      nodes: built
        .nodes()
        .map((node) =>
          node.kind === 'chatReaction' ? { ...node, props: {} } : node,
        ),
      edges: built.edges(),
    });

    expect(rule).toBeDefined();
    let lines: readonly string[] = ['не вызван'];
    expect(() => {
      lines = rule?.check(broken) ?? ['не вызван'];
    }).not.toThrow();
    expect(lines).toEqual([bare(SIGNAL_LINE)]);
  });

  test('узел chatSignal не прямо под узлом приложения (в корне и под мессенджером) — CH-03 его не проверяет', () => {
    const stray = (id: string) => ({
      kind: 'chatSignal',
      id,
      label: 'Сигнал сцены',
      description: 'Сигнал подставного поставщика не под приложением.',
      props: { signal: 'left' },
    });
    const report = ArchReport.of(
      sceneOf(
        [windowed()],
        [
          stub({
            nodes: [
              stray('signal-stray'),
              stray('exampleWindowed/messenger/signal-stray'),
            ],
            edges: [],
          }),
        ],
      ),
    );

    expect(report.rule('ARC-13')).toEqual([]);
    expect(report.rule('CH-03')).toEqual([]);
  });

  test('узел chatSignal другого поставщика прямо под приложением — CH-03 его проверяет', () => {
    const report = ArchReport.of(
      sceneOf(
        [windowed()],
        [
          stub({
            nodes: [
              {
                kind: 'chatSignal',
                id: 'exampleWindowed/signal-gone',
                label: 'Сигнал сцены',
                description: 'Сигнал подставного поставщика под приложением.',
                props: { signal: 'left' },
              },
            ],
            edges: [],
          }),
        ],
      ),
    );

    expect(report.rule('CH-03')).toEqual([SIGNAL_LINE]);
  });

  test('сигнал и реакция другого поставщика под приложением без мессенджера — строка «у приложения нет мессенджера» на каждый', () => {
    // exampleWindowed есть у поставщика dmg-ui, но не у ChatGraphProvider:
    // узла chatMessenger под ним нет, сигнал и реакцию ставит подставной.
    const scene: ArchApp = {
      ...ExampleArch,
      providers: [
        new UiGraphProvider({
          set: ExampleUiSetDef,
          apps: [ExampleDialogUiAppDef, ExampleWindowedUiAppDef],
        }),
        new ChatGraphProvider({ apps: [dialog()], examples: EXAMPLES }),
        stub({
          nodes: [
            {
              kind: 'chatSignal',
              id: 'exampleWindowed/signal-gone',
              label: 'Сигнал сцены',
              description: 'Сигнал подставного поставщика без мессенджера.',
              props: { signal: 'left' },
            },
            {
              kind: 'chatReaction',
              id: 'exampleWindowed/reaction-drop',
              label: 'Реакция сцены',
              description: 'Реакция подставного поставщика без мессенджера.',
              props: { operation: 'exclude' },
            },
          ],
          edges: [],
        }),
      ],
    };
    const report = ArchReport.of(scene);

    expect(report.code).toBe(1);
    expect([...report.rule('CH-03')].sort()).toEqual(
      [
        'CH-03: приложение exampleWindowed: реакция exampleWindowed/reaction-drop — у приложения нет мессенджера',
        'CH-03: приложение exampleWindowed: сигнал exampleWindowed/signal-gone — у приложения нет мессенджера',
      ].sort(),
    );
  });
});

describe('CH-03: тексты без данных (ERR-07)', () => {
  test('строки CH-03 не содержат подписей, описаний, имён UC и события, полей входа и целей манифеста', () => {
    const lines = ArchReport.of(sceneOf([windowed(COMMUNITY)])).rule('CH-03');
    const data = [
      GONE.label,
      GONE.description,
      DROP.label,
      DROP.description,
      RemoveUserUcDef.name,
      GetTaskUcDef.name,
      TaskEvents.assigned.name,
      'userId',
      'taskId',
      'ownerId',
    ];

    expect(lines).toHaveLength(2);
    for (const line of lines) {
      for (const text of data) expect(line).not.toContain(text);
    }
  });
});
