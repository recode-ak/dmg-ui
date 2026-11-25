import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ArchApp } from 'dmg-core/arch';
import { AppGraph, DomainIds, type Graph } from 'dmg-core/graph';
import {
  CompleteTaskUcDef,
  ExampleAppDef,
  GetTaskUcDef,
  RemoveUserUcDef,
  TaskEvents,
} from 'dmg-core/testing/example';
import type { AnyUiAppDef } from 'dmg-ui';
import { ExampleUiSetDef } from 'dmg-ui/testing';
import { ArchReport, UiScene } from 'dmg-ui/testing/fixtures';
import * as v from 'valibot';
import {
  ExampleDialogArch,
  ExampleDialogUiAppDef,
  ExampleWindowedUiAppDef,
  MemoryMessenger,
} from '../../testing';
import type { ChatCommunitySpec } from '../community/community.types';
import type { MessengerCapabilities } from '../messenger/messenger.types';
import { ChatGraphProvider } from './chat-graph-provider';
import { CHAT_VERSION } from './chat-kinds';

// Поставщик графа общей части мессенджеров `dmg-ui-chat` (D-UI-57): один на
// все приложения; под каждым приложением — узел возможностей `chatMessenger`,
// узлы входов беседы `chatEntry` с ребром `chatEnters` к экрану входа и точки
// входа `chatEntryPoint` с ребром `chatOpens` на вход. Сцены ставят точку на
// каждый вход приложения, если точки не заданы: иначе CH-02 даёт код 1.

const EDITING = MemoryMessenger.editing().capabilities;
const WINDOWED = MemoryMessenger.windowed(() => 0).capabilities;

const DIALOG = 'exampleDialog';
const WINDOWED_APP = 'exampleWindowed';

type EntryPoint = {
  readonly entry: string;
  readonly via: string;
  readonly key: string;
};

type AppSpec = {
  readonly app: AnyUiAppDef;
  readonly capabilities: MessengerCapabilities;
  readonly entryPoints?: readonly EntryPoint[];
};

/** Точка входа на вход `entry`; `via` и `key` — нейтральные слова сцены. */
const point = (entry: string, key = entry): EntryPoint => ({
  entry,
  via: 'message',
  key,
});

/** По точке на каждый вход приложения. */
const pointsOf = (app: AnyUiAppDef): readonly EntryPoint[] =>
  Object.keys(app.entries).map((entry) => point(entry));

const dialogSpec = (capabilities = EDITING): AppSpec => ({
  app: ExampleDialogUiAppDef,
  capabilities,
});

const windowedSpec = (): AppSpec => ({
  app: ExampleWindowedUiAppDef,
  capabilities: WINDOWED,
});

const graph = () => new AppGraph(ExampleDialogArch).build();

/** Узлы вида `kind` под приложением `app`. */
const childrenOf = (built: Graph, app: string, kind: string) =>
  built.children(app).filter((node) => node.kind === kind);

/** Цели рёбер вида `kind` из узла `from`, по порядку. */
const targets = (built: Graph, from: string, kind: string) =>
  built
    .outgoing(from, kind)
    .map((edge) => edge.to)
    .sort();

/** Сцена без домена: поставщик `dmg-ui` и `ChatGraphProvider` на `apps`; без точек — по точке на вход. */
const sceneOf = (apps: readonly AppSpec[]): ArchApp =>
  UiScene.appOf(
    ExampleUiSetDef,
    apps.map((spec) => spec.app),
    [
      new ChatGraphProvider({
        apps: apps.map((spec) => ({
          entryPoints: pointsOf(spec.app),
          ...spec,
        })),
      }),
    ],
  );

/** Текст броска сборки; не бросило — пустая строка. */
const thrown = (build: () => unknown): string => {
  try {
    build();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return '';
};

describe('ChatGraphProvider на графе примера', () => {
  test('оба приложения в одном графе: chatMessenger у exampleDialog и exampleWindowed, свойства — их возможности', () => {
    const built = graph();

    expect(childrenOf(built, DIALOG, 'chatMessenger')).toEqual([
      expect.objectContaining({
        id: 'exampleDialog/messenger',
        parent: DIALOG,
        provider: 'dmg-ui-chat',
        props: EDITING,
      }),
    ]);
    expect(childrenOf(built, WINDOWED_APP, 'chatMessenger')).toEqual([
      expect.objectContaining({
        id: 'exampleWindowed/messenger',
        parent: WINDOWED_APP,
        provider: 'dmg-ui-chat',
        props: WINDOWED,
      }),
    ]);
  });

  test('узел chatEntry на каждый вход приложения: у exampleDialog — start, assigned и menu, у exampleWindowed — start', () => {
    const built = graph();
    const entries = (app: string) =>
      childrenOf(built, app, 'chatEntry')
        .map((node) => ({
          id: node.id,
          provider: node.provider,
          props: node.props,
        }))
        .sort((a, b) => a.id.localeCompare(b.id));

    expect(entries(DIALOG)).toEqual([
      {
        id: 'exampleDialog/enter-assigned',
        provider: 'dmg-ui-chat',
        props: { entry: 'assigned' },
      },
      {
        id: 'exampleDialog/enter-menu',
        provider: 'dmg-ui-chat',
        props: { entry: 'menu' },
      },
      {
        id: 'exampleDialog/enter-start',
        provider: 'dmg-ui-chat',
        props: { entry: 'start' },
      },
    ]);
    expect(entries(WINDOWED_APP)).toEqual([
      {
        id: 'exampleWindowed/enter-start',
        provider: 'dmg-ui-chat',
        props: { entry: 'start' },
      },
    ]);
  });

  test('ребро chatEnters ведёт от входа беседы на экран входа приложения', () => {
    const built = graph();

    expect(targets(built, 'exampleDialog/enter-start', 'chatEnters')).toEqual([
      'exampleUi/todo/taskList',
    ]);
    expect(
      targets(built, 'exampleDialog/enter-assigned', 'chatEnters'),
    ).toEqual(['exampleUi/todo/assignedTasks']);
    expect(targets(built, 'exampleWindowed/enter-start', 'chatEnters')).toEqual(
      ['exampleUi/todo/taskList'],
    );
  });

  test('поставщик примера — один ChatGraphProvider dmg-ui-chat с видами chatMessenger, chatEntry, chatEntryPoint, chatEnters и chatOpens', () => {
    const providers = ExampleDialogArch.providers ?? [];
    const chat = providers.filter(
      (provider) => provider instanceof ChatGraphProvider,
    );
    const kinds = chat[0]?.kinds();

    expect(chat.map((provider) => provider.name)).toEqual(['dmg-ui-chat']);
    expect(kinds?.nodes.map((kind) => kind.kind)).toEqual(
      expect.arrayContaining(['chatMessenger', 'chatEntry', 'chatEntryPoint']),
    );
    expect(kinds?.edges.map((kind) => kind.kind)).toEqual(
      expect.arrayContaining(['chatEnters', 'chatOpens']),
    );
  });

  test('версия поставщика равна version из package.json', () => {
    const file = join(import.meta.dir, '../../../../package.json');
    const { version } = v.parse(
      v.object({ version: v.string() }),
      JSON.parse(readFileSync(file, 'utf8')),
    );
    const chat = (ExampleDialogArch.providers ?? []).find(
      (provider) => provider instanceof ChatGraphProvider,
    );

    expect(chat?.version).toBe(version);
    expect(CHAT_VERSION).toBe(version);
  });

  test('граф собирается документом dmg-core graph: свойства chatMessenger — JSON', () => {
    const document = new AppGraph(ExampleDialogArch).document('0.0.0');
    const json: { nodes: { id: string; kind: string; props: unknown }[] } =
      JSON.parse(document.serialize());
    const messengers = json.nodes
      .filter((node) => node.kind === 'chatMessenger')
      .map((node) => ({ id: node.id, props: node.props }));

    expect(messengers).toEqual([
      { id: 'exampleDialog/messenger', props: EDITING },
      { id: 'exampleTrimmed/messenger', props: EDITING },
      { id: 'exampleWindowed/messenger', props: WINDOWED },
    ]);
    expect(
      document
        .toJSON()
        .providers.map((provider) => provider.name)
        .includes('dmg-ui-chat'),
    ).toBe(true);
  });
});

describe('ChatGraphProvider — точки входа', () => {
  /** Граф сцены: у `exampleDialog` две точки на `start` и одна на `assigned`, у `exampleWindowed` — по точке на вход. */
  const pointsScene = () =>
    new AppGraph(
      sceneOf([
        {
          ...dialogSpec(),
          entryPoints: [
            point('start'),
            point('assigned'),
            point('start', 'again'),
          ],
        },
        windowedSpec(),
      ]),
    ).build();

  test('узел chatEntryPoint под приложением на каждую точку: id <app>/point-<вход>-<n> с n от 1 внутри входа, свойства — { entry, via, key }', () => {
    const points = childrenOf(pointsScene(), DIALOG, 'chatEntryPoint')
      .map((node) => ({
        id: node.id,
        provider: node.provider,
        props: node.props,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));

    expect(points).toEqual([
      {
        id: 'exampleDialog/point-assigned-1',
        provider: 'dmg-ui-chat',
        props: { entry: 'assigned', via: 'message', key: 'assigned' },
      },
      {
        id: 'exampleDialog/point-start-1',
        provider: 'dmg-ui-chat',
        props: { entry: 'start', via: 'message', key: 'start' },
      },
      {
        id: 'exampleDialog/point-start-2',
        provider: 'dmg-ui-chat',
        props: { entry: 'start', via: 'message', key: 'again' },
      },
    ]);
  });

  test('ребро chatOpens ведёт от точки входа на узел chatEntry своего входа', () => {
    const graph = pointsScene();
    const opens = (app: string) =>
      childrenOf(graph, app, 'chatEntryPoint')
        .map((node) => ({
          from: node.id,
          to: targets(graph, node.id, 'chatOpens'),
        }))
        .sort((a, b) => a.from.localeCompare(b.from));

    expect(opens(DIALOG)).toEqual([
      {
        from: 'exampleDialog/point-assigned-1',
        to: ['exampleDialog/enter-assigned'],
      },
      {
        from: 'exampleDialog/point-start-1',
        to: ['exampleDialog/enter-start'],
      },
      {
        from: 'exampleDialog/point-start-2',
        to: ['exampleDialog/enter-start'],
      },
    ]);
    expect(opens(WINDOWED_APP)).toEqual([
      {
        from: 'exampleWindowed/point-start-1',
        to: ['exampleWindowed/enter-start'],
      },
    ]);
    expect(graph.node('exampleDialog/enter-start')?.kind).toBe('chatEntry');
    expect(
      new Set(
        graph
          .edges()
          .filter((edge) => edge.kind === 'chatOpens')
          .map((edge) => edge.provider),
      ),
    ).toEqual(new Set(['dmg-ui-chat']));
  });
});

describe('ChatGraphProvider — ошибки сборки', () => {
  test('два приложения с одним именем — бросок конструктора с именем приложения', () => {
    const message = thrown(
      () =>
        new ChatGraphProvider({
          apps: [dialogSpec(EDITING), dialogSpec(WINDOWED)],
        }),
    );

    expect(message).toMatch(/exampleDialog/);
  });

  test('возможности не по схеме (options.max: 0) — бросок конструктора без значений возможностей', () => {
    const broken: MessengerCapabilities = {
      ...EDITING,
      options: { ...EDITING.options, max: 0 },
    };

    const message = thrown(
      () =>
        new ChatGraphProvider({
          apps: [dialogSpec(broken)],
        }),
    );

    expect(message).toMatch(/exampleDialog/);
    expect(message).toMatch(/возможност/);
    expect(message).not.toContain(JSON.stringify(broken));
    expect(message).not.toContain(JSON.stringify(broken.options));
  });

  test('точка входа ссылается на вход, которого нет у приложения, — бросок конструктора с именем приложения и входа', () => {
    const message = thrown(
      () =>
        new ChatGraphProvider({
          apps: [
            {
              ...dialogSpec(),
              entryPoints: [
                point('start'),
                { entry: 'nowhere', via: 'message', key: 'ghostKey' },
              ],
            },
          ],
        }),
    );

    expect(message).toMatch(/exampleDialog/);
    expect(message).toMatch(/nowhere/);
    expect(message).not.toContain('ghostKey');
  });
});

// Сообщество: сигнал мессенджера — узел `chatSignal` под
// приложением с ребром ядра `invokes` к объявленному UC; реакция — узел
// `chatReaction` с рёбрами ядра `notifiedBy` к событию и `reads` к query UC.
// Тип UC поставщик не проверяет: реакцию на command UC ловит UI-10.

/** `id` узлов домена учебного приложения — концы рёбер сообщества. */
const domain = new DomainIds(ExampleAppDef);

/** Приложение сцены с манифестами сообщества. */
type CommunityAppSpec = AppSpec & { readonly community?: ChatCommunitySpec };

/** `exampleDialog` на `editing` с манифестами `community`. */
const dialogWith = (community: ChatCommunitySpec): CommunityAppSpec => ({
  ...dialogSpec(),
  community,
});

/** Сигнал `left` → `removeUser`; человек — в поле `userId`. */
const GONE = {
  name: 'gone',
  label: 'Участник вышел',
  description: 'Участник вышел из группы — учётная запись удаляется.',
  signal: 'left',
  uc: RemoveUserUcDef,
  input: { userId: 'person' },
} as const;

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

const COMMUNITY: ChatCommunitySpec = { signals: [GONE], reactions: [DROP] };

/** Граф сцены: `exampleDialog` с сообществом `community`, `exampleWindowed` — без. */
const communityGraph = (community: ChatCommunitySpec = COMMUNITY) =>
  new AppGraph(sceneOf([dialogWith(community), windowedSpec()])).build();

describe('ChatGraphProvider — сообщество: узлы', () => {
  test('узлы chatSignal и chatReaction под приложением: id <app>/signal-<имя> и <app>/reaction-<имя>, props { signal } и { operation }, поставщик dmg-ui-chat', () => {
    const built = communityGraph();

    expect(childrenOf(built, DIALOG, 'chatSignal')).toEqual([
      expect.objectContaining({
        kind: 'chatSignal',
        id: 'exampleDialog/signal-gone',
        parent: DIALOG,
        provider: 'dmg-ui-chat',
        props: { signal: 'left' },
      }),
    ]);
    expect(childrenOf(built, DIALOG, 'chatReaction')).toEqual([
      expect.objectContaining({
        kind: 'chatReaction',
        id: 'exampleDialog/reaction-drop',
        parent: DIALOG,
        provider: 'dmg-ui-chat',
        props: { operation: 'exclude' },
      }),
    ]);
  });

  test('приложение без community — узлов chatSignal и chatReaction под ним нет', () => {
    const built = communityGraph();

    expect(childrenOf(built, WINDOWED_APP, 'chatSignal')).toEqual([]);
    expect(childrenOf(built, WINDOWED_APP, 'chatReaction')).toEqual([]);
  });

  test('виды поставщика — среди них chatSignal и chatReaction; рёбра сообщества — виды ядра, поставщик их не объявляет', () => {
    const chat = new ChatGraphProvider({
      apps: [dialogWith(COMMUNITY)],
    });
    const kinds = chat.kinds();

    expect(kinds.nodes.map((kind) => kind.kind)).toEqual(
      expect.arrayContaining(['chatSignal', 'chatReaction']),
    );
    const edges = kinds.edges.map((kind) => kind.kind);
    expect(edges).not.toContain('invokes');
    expect(edges).not.toContain('notifiedBy');
    expect(edges).not.toContain('reads');
  });

  test('правила поставщика — ровно CH-02 и CH-03', () => {
    const chat = new ChatGraphProvider({
      apps: [dialogSpec()],
    });

    expect(chat.rules().map((rule) => rule.id)).toEqual(['CH-02', 'CH-03']);
  });
});

describe('ChatGraphProvider — сообщество: рёбра', () => {
  test('invokes ведёт от сигнала к UC сигнала, конец — DomainIds.operation', () => {
    const built = communityGraph();

    expect(targets(built, 'exampleDialog/signal-gone', 'invokes')).toEqual([
      domain.operation(RemoveUserUcDef),
    ]);
  });

  test('notifiedBy ведёт от реакции к событию, reads — к query UC реакции; концы по DomainIds', () => {
    const built = communityGraph();

    expect(targets(built, 'exampleDialog/reaction-drop', 'notifiedBy')).toEqual(
      [domain.event(TaskEvents.assigned)],
    );
    expect(targets(built, 'exampleDialog/reaction-drop', 'reads')).toEqual([
      domain.operation(GetTaskUcDef),
    ]);
  });

  test('рёбра сообщества ставит поставщик dmg-ui-chat, других рёбер у узлов сообщества нет', () => {
    const built = communityGraph();
    const from = (id: string) =>
      built
        .edges()
        .filter((edge) => edge.from === id)
        .map((edge) => ({ kind: edge.kind, provider: edge.provider }))
        .sort((a, b) => a.kind.localeCompare(b.kind));

    expect(from('exampleDialog/signal-gone')).toEqual([
      { kind: 'invokes', provider: 'dmg-ui-chat' },
    ]);
    expect(from('exampleDialog/reaction-drop')).toEqual([
      { kind: 'notifiedBy', provider: 'dmg-ui-chat' },
      { kind: 'reads', provider: 'dmg-ui-chat' },
    ]);
  });
});

describe('ChatGraphProvider — сообщество: правила ядра', () => {
  test('реакция читает command UC — поставщик не бросает, UI-10 в отчёте, код 1', () => {
    const scene = sceneOf([
      dialogWith({ reactions: [{ ...DROP, uc: CompleteTaskUcDef }] }),
    ]);

    const report = ArchReport.of(scene);

    expect(report.code).toBe(1);
    expect(report.rule('UI-10')).toEqual([
      `UI-10: exampleDialog/reaction-drop привязан к событию и вызывает command UC ${domain.operation(CompleteTaskUcDef)}`,
    ]);
  });

  test('сообщество exampleDialog на мессенджере, который всё умеет, — arch:check без нарушений', () => {
    const report = ArchReport.of(
      sceneOf([dialogWith(COMMUNITY), windowedSpec()]),
    );

    expect(report.lines).toEqual([
      'arch:check example: нарушений — 0',
      'arch:check: нарушений нет',
    ]);
    expect(report.code).toBe(0);
  });
});

describe('ChatGraphProvider — сообщество: документ графа', () => {
  test('граф с сообществом собирается документом dmg-core graph: свойства chatSignal и chatReaction — JSON', () => {
    const scene = sceneOf([dialogWith(COMMUNITY), windowedSpec()]);
    const json: { nodes: { id: string; kind: string; props: unknown }[] } =
      JSON.parse(new AppGraph(scene).document('0.0.0').serialize());
    const community = json.nodes
      .filter(
        (node) => node.kind === 'chatSignal' || node.kind === 'chatReaction',
      )
      .map((node) => ({ id: node.id, kind: node.kind, props: node.props }))
      .sort((a, b) => a.id.localeCompare(b.id));

    expect(community).toEqual([
      {
        id: 'exampleDialog/reaction-drop',
        kind: 'chatReaction',
        props: { operation: 'exclude' },
      },
      {
        id: 'exampleDialog/signal-gone',
        kind: 'chatSignal',
        props: { signal: 'left' },
      },
    ]);
  });

  test('граф примера без community: узлов сообщества и рёбер invokes, notifiedBy, reads поставщика dmg-ui-chat нет', () => {
    const built = graph();

    expect(
      built
        .nodes()
        .filter(
          (node) => node.kind === 'chatSignal' || node.kind === 'chatReaction',
        ),
    ).toEqual([]);
    expect(
      built
        .edges()
        .filter(
          (edge) =>
            edge.provider === 'dmg-ui-chat' &&
            ['invokes', 'notifiedBy', 'reads'].includes(edge.kind),
        ),
    ).toEqual([]);
  });
});
