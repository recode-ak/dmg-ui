import { describe, expect, test } from 'bun:test';
import type { ArchApp } from 'dmg-core/arch';
import { AppGraph, type Graph } from 'dmg-core/graph';
import { ExampleArch } from 'dmg-core/testing';
import { ExampleAppDef } from 'dmg-core/testing/example';
import { type AnyUiAppDef, ScreenDef, UiModuleDef, UiSetDef } from 'dmg-ui';
import { UiGraphProvider } from 'dmg-ui/graph';
import {
  ExampleUiSetDef,
  TaskCardScreenDef,
  TaskListScreenDef,
} from 'dmg-ui/testing';
import { ArchReport, StubViewProvider } from 'dmg-ui/testing/fixtures';
import * as v from 'valibot';
import {
  ExampleDialogAppDef,
  ExampleDialogArch,
  ExampleWindowedAppDef,
  exampleDialogViews,
  MemoryMessenger,
} from '../../testing';
import { AssignedTasksView } from '../../testing/example/assigned-tasks.view';
import { TaskListView } from '../../testing/example/task-list.view';
import {
  TaskAssignedView,
  TaskCompletedView,
} from '../../testing/example/task-notes.view';
import type { MessengerCapabilities } from '../messenger/messenger.types';
import { ChatViews } from '../view/chat-views';
import { ScreenPresenter } from '../view/screen-presenter';
import { ChatGraphProvider } from './chat-graph-provider';

// Поставщик графа общей части мессенджеров `dmg-ui-chat` (D-UI-57): один на
// все приложения; под каждым приложением — узел возможностей `chatMessenger`
// и узлы входов беседы `chatEntry` с ребром `chatEnters` к экрану входа;
// рёбра `presents` — от приложения к целям его реестра представлений.

const EDITING = MemoryMessenger.editing().capabilities;
const WINDOWED = MemoryMessenger.windowed(() => 0).capabilities;

const DIALOG = 'exampleDialog';
const WINDOWED_APP = 'exampleWindowed';
const CARD = 'exampleUi/todo/taskCard';

/** Цели `presents` учебного примера: все экраны и уведомления набора. */
const PRESENTED = [
  'exampleUi/todo/assignedTasks',
  'exampleUi/todo/taskAssigned',
  CARD,
  'exampleUi/todo/taskCompleted',
  'exampleUi/todo/taskList',
];

type AppSpec = {
  readonly app: AnyUiAppDef;
  readonly views: ChatViews;
  readonly capabilities: MessengerCapabilities;
};

const dialogSpec = (capabilities = EDITING): AppSpec => ({
  app: ExampleDialogAppDef,
  views: exampleDialogViews,
  capabilities,
});

const windowedSpec = (views = exampleDialogViews): AppSpec => ({
  app: ExampleWindowedAppDef,
  views,
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

/** Сцена: домен примера, поставщик `dmg-ui` и `ChatGraphProvider` на `apps`. */
const sceneOf = (apps: readonly AppSpec[]): ArchApp => ({
  ...ExampleArch,
  providers: [
    new UiGraphProvider({
      set: ExampleUiSetDef,
      apps: apps.map((spec) => spec.app),
    }),
    new ChatGraphProvider({ apps }),
  ],
});

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

  test('presents — от каждого приложения к каждому экрану и уведомлению, поставщик dmg-ui-chat', () => {
    const built = graph();
    const presents = built.edges().filter((edge) => edge.kind === 'presents');

    expect(targets(built, DIALOG, 'presents')).toEqual(PRESENTED);
    expect(targets(built, WINDOWED_APP, 'presents')).toEqual(PRESENTED);
    expect(presents).toHaveLength(2 * PRESENTED.length);
    expect(new Set(presents.map((edge) => edge.provider))).toEqual(
      new Set(['dmg-ui-chat']),
    );
  });

  test('узел chatEntry на каждый вход приложения: у exampleDialog — start и assigned, у exampleWindowed — start', () => {
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

  test('поставщик примера — один ChatGraphProvider dmg-ui-chat с видами chatMessenger, chatEntry и chatEnters; заглушки представления нет', () => {
    const providers = ExampleDialogArch.providers ?? [];
    const chat = providers.filter(
      (provider) => provider instanceof ChatGraphProvider,
    );
    const kinds = chat[0]?.kinds();

    expect(chat.map((provider) => provider.name)).toEqual(['dmg-ui-chat']);
    expect(kinds?.nodes.map((kind) => kind.kind)).toEqual(
      expect.arrayContaining(['chatMessenger', 'chatEntry']),
    );
    expect(kinds?.edges.map((kind) => kind.kind)).toEqual(
      expect.arrayContaining(['chatEnters']),
    );
    expect(
      providers.some((provider) => provider instanceof StubViewProvider),
    ).toBe(false);
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

describe('ChatGraphProvider — перекрытый реестр', () => {
  test('presents у перекрытого реестра (views.over) — те же пять целей без повторов', () => {
    const own = exampleDialogViews.over([
      ScreenPresenter.for(TaskCardScreenDef, () => 'Своя карточка'),
      ScreenPresenter.for(TaskListScreenDef, () => 'Свой список'),
    ]);
    const built = new AppGraph(
      sceneOf([dialogSpec(), windowedSpec(own)]),
    ).build();
    const windowed = built
      .outgoing(WINDOWED_APP, 'presents')
      .map((edge) => edge.to);

    expect([...windowed].sort()).toEqual(PRESENTED);
    expect(new Set(windowed).size).toBe(windowed.length);
    expect(targets(built, DIALOG, 'presents')).toEqual(PRESENTED);
  });
});

describe('ChatGraphProvider — экран без представления', () => {
  test('нет представления карточки — нет ребра presents, UI-06 в отчёте arch:check', () => {
    const views = ChatViews.of(ExampleUiSetDef, [
      TaskListView,
      AssignedTasksView,
      TaskAssignedView,
      TaskCompletedView,
    ]);
    const app = sceneOf([
      { app: ExampleDialogAppDef, views, capabilities: EDITING },
    ]);

    const report = ArchReport.of(app);

    expect(targets(new AppGraph(app).build(), DIALOG, 'presents')).toEqual(
      PRESENTED.filter((id) => id !== CARD),
    );
    expect(report.code).not.toBe(0);
    expect(report.rule('UI-06')).toEqual([
      'UI-06: приложение exampleDialog: у экрана exampleUi/todo/taskCard нет представления в канале',
    ]);
  });
});

/** Экран вне учебного набора — для реестра другого набора. */
const StrayScreenDef = ScreenDef.define({
  name: 'stray',
  label: 'Чужой',
  description: 'Экран вне учебного набора.',
  reads: [],
  data: v.object({}),
});

/** Другой набор UI поверх учебного домена. */
const OtherSetDef = UiSetDef.define({
  name: 'otherUi',
  label: 'Другой набор',
  description: 'Набор, которого нет у приложений примера.',
  app: ExampleAppDef,
  modules: [
    UiModuleDef.define({
      name: 'desk',
      label: 'Стол',
      description: 'Один экран.',
      screens: [StrayScreenDef],
      stories: [],
    }),
  ],
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

  test('реестр представлений другого набора, чем набор приложения, — бросок конструктора', () => {
    const message = thrown(
      () =>
        new ChatGraphProvider({
          apps: [
            {
              app: ExampleDialogAppDef,
              views: ChatViews.of(OtherSetDef, []),
              capabilities: EDITING,
            },
          ],
        }),
    );

    expect(message).toMatch(/exampleDialog/);
    expect(message).toMatch(/набор/);
  });

  test('возможности не по схеме (options.max: 0) — бросок конструктора без значений возможностей', () => {
    const broken: MessengerCapabilities = {
      ...EDITING,
      options: { ...EDITING.options, max: 0 },
    };

    const message = thrown(
      () => new ChatGraphProvider({ apps: [dialogSpec(broken)] }),
    );

    expect(message).toMatch(/exampleDialog/);
    expect(message).toMatch(/возможност/);
    expect(message).not.toContain(JSON.stringify(broken));
    expect(message).not.toContain(JSON.stringify(broken.options));
  });
});
