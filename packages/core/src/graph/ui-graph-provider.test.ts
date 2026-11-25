import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { toJsonSchema } from 'dmg-core';
import { AppGraph, GraphError } from 'dmg-core/graph';
import {
  ExampleAppDef,
  GetTaskUcDef,
  TaskEvents,
  TaskPolicy,
  TaskRules,
} from 'dmg-core/testing/example';
import { ScreenProvider } from 'dmg-core/testing/example/screen/screen-provider';
import { TasksScreenDef } from 'dmg-core/testing/example/screen/tasks.screen';
import {
  ExampleUiSetDef,
  LIST_START,
  StartWorkStoryDef,
  TaskCardScreenDef,
  TaskListScreenDef,
} from 'dmg-ui/example';
import * as v from 'valibot';
import {
  ExampleMenuStubUiAppDef,
  ExampleMenuTrimmedStubUiAppDef,
  ExampleStubUiAppDef,
} from '../../testing/ui-app.fixture';
import { ArchReport, UiScene } from '../../testing/ui-arch';
import { type AnyScreenDef, ScreenDef } from '../manifest/screen-def';
import { StoryTree } from '../manifest/story-tree';
import type { StoryBranch } from '../manifest/story-tree.types';
import { UiModuleDef } from '../manifest/ui-module-def';
import { UiSetDef } from '../manifest/ui-set-def';
import { UiGraphProvider } from './ui-graph-provider';
import { UI_VERSION } from './ui-kinds';

const provider = () =>
  new UiGraphProvider({
    set: ExampleUiSetDef,
    apps: [ExampleStubUiAppDef],
    channels: [],
  });
const appGraph = () =>
  new AppGraph({ def: ExampleAppDef, providers: [provider()] });
const graph = appGraph().build();
const own = graph.nodes().filter((node) => node.provider === 'dmg-ui');
const ownEdges = graph.edges().filter((edge) => edge.provider === 'dmg-ui');
const SCREEN = 'exampleUi/todo/taskList';
const CARD = 'exampleUi/todo/taskCard';
const ASSIGNED = 'exampleUi/todo/assignedTasks';
const COMPLETED = 'exampleUi/todo/taskCompleted';
const MENU = 'exampleUi/todo/mainMenu';

const pairs = (kind: string) =>
  ownEdges
    .filter((edge) => edge.kind === kind)
    .map((edge) => `${edge.from} -> ${edge.to}`);

const props = (id: string) => graph.node(id)?.props;
const edgeProps = (kind: string, from: string, to: string) =>
  ownEdges.find((e) => e.kind === kind && e.from === from && e.to === to)
    ?.props;

describe('UiGraphProvider: узлы', () => {
  test('35 узлов набора и приложения UI в каноническом порядке', () => {
    expect(own.map((node) => node.id)).toEqual([
      'exampleStub',
      'exampleUi',
      'exampleUi/todo',
      ASSIGNED,
      `${ASSIGNED}/close`,
      `${ASSIGNED}/completeSelected`,
      `${ASSIGNED}/openAssignee`,
      'exampleUi/todo/finishTasks',
      'exampleUi/todo/followAssigned',
      MENU,
      `${MENU}/assigned`,
      `${MENU}/close`,
      `${MENU}/tasks`,
      'exampleUi/todo/planTasks',
      'exampleUi/todo/startWork',
      'exampleUi/todo/taskAssigned',
      CARD,
      `${CARD}/assign`,
      `${CARD}/back`,
      `${CARD}/complete`,
      `${CARD}/remind`,
      COMPLETED,
      SCREEN,
      `${SCREEN}/close`,
      `${SCREEN}/completeSelected`,
      `${SCREEN}/create`,
      `${SCREEN}/jumpTo`,
      `${SCREEN}/next`,
      `${SCREEN}/open`,
      `${SCREEN}/prev`,
      'exampleUi/users',
      'exampleUi/users/userCard',
      'exampleUi/users/userCard/close',
      'exampleUi/users/userCard/tasks',
      'exampleUi/users/viewUser',
    ]);
  });

  test('виды узлов: по одному на набор, модуль, приложение, остальные — по составу', () => {
    const count = (kind: string) => own.filter((n) => n.kind === kind).length;

    expect(
      Object.fromEntries(
        ['uiSet', 'uiModule', 'screen', 'story', 'notification'].map((k) => [
          k,
          count(k),
        ]),
      ),
    ).toEqual({ uiSet: 1, uiModule: 2, screen: 5, story: 5, notification: 2 });
    expect(count('action')).toBe(19);
    expect(count('uiApp')).toBe(1);
  });

  test('родитель выводится из id, поставщик — dmg-ui', () => {
    expect(graph.node(CARD)).toMatchObject({
      kind: 'screen',
      parent: 'exampleUi/todo',
      provider: 'dmg-ui',
    });
    expect(graph.node(`${CARD}/back`)).toMatchObject({
      kind: 'action',
      parent: CARD,
      provider: 'dmg-ui',
    });
    expect(graph.node('exampleUi/todo')?.parent).toBe('exampleUi');
  });

  test('три независимых корня: домен, набор UI, приложение UI', () => {
    expect(graph.roots().map((node) => node.id)).toEqual([
      'example',
      'exampleStub',
      'exampleUi',
    ]);
  });

  test('подписи и видимость узла — из Def; у действия — из действия', () => {
    expect(graph.node(SCREEN)).toMatchObject({
      label: TaskListScreenDef.label,
      description: TaskListScreenDef.description,
      visible: false,
    });
    expect(graph.node(`${SCREEN}/create`)).toMatchObject({
      label: 'Создать задачу',
      description: 'Новая задача в списке.',
      visible: true,
    });
    expect(graph.node(`${SCREEN}/open`)?.visible).toBe(false);
  });

  test('виды поставщика в документе: узлы и рёбра — точный список рёбер без вида показа', () => {
    const info = graph.providers.find((p) => p.name === 'dmg-ui');

    expect(info?.nodeKinds.map((k) => k.kind)).toEqual([
      'action',
      'notification',
      'screen',
      'story',
      'uiApp',
      'uiModule',
      'uiSet',
    ]);
    expect(info?.edgeKinds.map((k) => k.kind)).toEqual([
      'catches',
      'entry',
      'includes',
      'invokes',
      'leads',
      'leadsTo',
      'links',
      'notifiedBy',
      'omits',
      'reads',
      'recipients',
      'redirects',
      'refreshedBy',
      'requires',
    ]);
  });
});

describe('UiGraphProvider: свойства узлов', () => {
  test('экран taskList: схемы, основное действие, локальные, выходы, примеры', () => {
    expect(props(SCREEN)).toEqual({
      hint: TaskListScreenDef.hint,
      params: toJsonSchema(TaskListScreenDef.params),
      state: toJsonSchema(TaskListScreenDef.state),
      primary: 'create',
      locals: [
        {
          name: 'toggle',
          label: 'Отметить задачу',
          description: 'Добавляет задачу в выбор или убирает из него.',
          input: toJsonSchema(TaskListScreenDef.locals.toggle.input),
        },
      ],
      exits: [
        {
          name: 'created',
          label: 'Задача создана',
          description: 'Создание задачи завершило сторис.',
          data: toJsonSchema(TaskListScreenDef.exits.created.data!),
        },
        {
          name: 'closed',
          label: 'Список закрыт',
          description: 'Пользователь закрыл список.',
        },
      ],
      examples: ['empty', 'full'],
    });
  });

  test('порядок ключей props экрана фиксирован', () => {
    expect(Object.keys(props(SCREEN) ?? {})).toEqual([
      'hint',
      'params',
      'state',
      'primary',
      'locals',
      'exits',
      'examples',
    ]);
  });

  test('экран без состояния и основного действия — без ключей state и primary', () => {
    const card = props(CARD);

    expect(card).toEqual({
      params: toJsonSchema(TaskCardScreenDef.params),
      locals: [],
      exits: [],
      examples: ['open', 'done'],
    });
    expect(card).not.toHaveProperty('state');
    expect(card).not.toHaveProperty('primary');
  });

  test('действие: вход и подтверждение, у перехода без входа — пустые props', () => {
    expect(props(`${SCREEN}/create`)).toEqual({
      input: toJsonSchema(TaskListScreenDef.actions.create.input!),
    });
    expect(props(`${SCREEN}/completeSelected`)).toEqual({
      confirm: {
        label: 'Выполнить выбранные задачи?',
        description: 'Выполненную задачу нельзя вернуть в работу.',
      },
    });
    expect(props(`${SCREEN}/next`)).toEqual({});
  });

  test('сторис: вызывающие, цель, старт и исходы с { screen, exit }', () => {
    expect(props('exampleUi/todo/planTasks')).toEqual({
      callers: ['user'],
      goal: 'чтобы не забыть дела',
      start: SCREEN,
      outcomes: [
        {
          name: 'created',
          label: 'Задача добавлена',
          description: 'В списке появилась новая задача.',
          exits: [{ screen: SCREEN, exit: 'created' }],
          after: { screen: SCREEN, params: LIST_START.params },
        },
        {
          name: 'closed',
          label: 'Список закрыт',
          description: 'Пользователь закрыл список, не добавив задачу.',
          exits: [{ screen: SCREEN, exit: 'closed' }],
          after: 'back',
        },
      ],
    });
  });

  test('сторис: цель исхода — back по умолчанию, home у меню, адрес — экран и параметры', () => {
    const thens = (id: string) =>
      (props(id) as { outcomes: { after: unknown }[] }).outcomes.map(
        (outcome) => outcome.after,
      );

    expect(thens('exampleUi/todo/startWork')).toEqual(['home']);
    expect(thens('exampleUi/todo/finishTasks')).toEqual([
      { screen: SCREEN, params: LIST_START.params },
      'back',
    ]);
    expect(thens('exampleUi/users/viewUser')).toEqual(['back']);
  });

  test('приложение UI: набор, канал и входы с адресом экрана', () => {
    expect(props('exampleStub')).toEqual({
      set: 'exampleUi',
      channel: 'dmg-ui-stub',
      roots: [
        'exampleUi/todo/planTasks',
        'exampleUi/todo/finishTasks',
        'exampleUi/todo/followAssigned',
      ],
      entries: [
        {
          name: 'start',
          label: 'Мои задачи',
          description: 'Список своих задач с начала.',
          screen: SCREEN,
          params: LIST_START.params,
        },
        {
          name: 'assigned',
          label: 'Назначенные мне',
          description: 'Задачи, которые поручили вызывающему.',
          screen: ASSIGNED,
          params: {},
        },
      ],
    });
  });

  test('набор — доменное приложение, модуль — пустые props, уведомление — получатели', () => {
    expect(props('exampleUi')).toEqual({ app: 'example' });
    expect(props('exampleUi/todo')).toEqual({});
    expect(props('exampleUi/todo/taskAssigned')).toEqual({
      recipients: { from: 'payload', fields: ['assigneeId'] },
      examples: ['sample'],
    });
    expect(props(COMPLETED)).toEqual({
      recipients: {
        from: 'query',
        input: { taskId: 'taskId' },
        fields: ['assigneeId'],
      },
      examples: ['sample'],
    });
  });
});

describe('UiGraphProvider: подсказки в графе', () => {
  type InputProps = {
    input: {
      properties: Record<string, Record<string, unknown>>;
    };
  };
  const inputOf = (id: string) => (props(id) as unknown as InputProps).input;

  test('props.hint у сторис, экрана и действия — из Def', () => {
    expect(props('exampleUi/todo/startWork')?.hint).toBe(
      StartWorkStoryDef.hint!,
    );
    expect(props(SCREEN)?.hint).toBe(TaskListScreenDef.hint!);
    expect(props(`${SCREEN}/jumpTo`)?.hint).toBe(
      TaskListScreenDef.actions.jumpTo.hint!,
    );
    expect(StartWorkStoryDef.hint).toBeString();
  });

  test('props.hint у локального действия экрана — в записи locals', () => {
    const hinted = ScreenDef.define({
      name: 'hinted',
      label: 'С подсказками',
      description: 'Экран с локальным действием с подсказкой.',
      reads: [],
      data: v.object({}),
      state: v.strictObject({}),
      locals: {
        pick: {
          label: 'Выбрать',
          description: 'Локальное.',
          hint: 'Подсказка локального',
        },
        drop: { label: 'Сбросить', description: 'Без подсказки.' },
      },
    });
    const scene = new UiScene({ screens: [hinted] });
    const built = new AppGraph({
      def: ExampleAppDef,
      providers: [
        new UiGraphProvider({
          set: scene.set,
          apps: [scene.app],
          channels: [],
        }),
      ],
    }).build();

    const locals = built.node('miniUi/todo/hinted')?.props.locals as {
      name: string;
      hint?: string;
    }[];

    expect(locals.find((l) => l.name === 'pick')?.hint).toBe(
      'Подсказка локального',
    );
    expect(locals.find((l) => l.name === 'drop')).not.toHaveProperty('hint');
  });

  test('без подсказки в Def — в props нет ключа hint', () => {
    expect(props(CARD)).not.toHaveProperty('hint');
    expect(props(`${SCREEN}/next`)).not.toHaveProperty('hint');
    expect(props('exampleUi/todo/planTasks')).not.toHaveProperty('hint');
  });

  test('props.input.properties.<поле> несёт hint, title и example из схемы поля', () => {
    const title = inputOf(`${SCREEN}/create`).properties.title;

    expect(title).toMatchObject({
      title: 'Название задачи',
      hint: 'Коротко: что нужно сделать',
      examples: ['Купить хлеб'],
      minLength: 1,
    });
  });

  test('jumpTo: title, hint, minimum и maximum поля part в props входа', () => {
    expect(inputOf(`${SCREEN}/jumpTo`).properties.part).toMatchObject({
      type: 'integer',
      title: 'Часть',
      hint: 'Номер части списка, с первой',
      minimum: 1,
      maximum: 99,
      examples: [2],
    });
  });

  test('поле без подсказки — в схеме входа нет ключа hint', () => {
    expect(inputOf(`${SCREEN}/open`).properties.taskId).not.toHaveProperty(
      'hint',
    );
  });
});

describe('UiGraphProvider: рёбра', () => {
  test('рёбра поставщика: 50 штук, по видам', () => {
    const counts: Record<string, number> = {};
    for (const edge of ownEdges)
      counts[edge.kind] = (counts[edge.kind] ?? 0) + 1;

    expect(ownEdges).toHaveLength(50);
    expect(counts).toEqual({
      includes: 11,
      leads: 5,
      requires: 1,
      entry: 2,
      reads: 6,
      invokes: 5,
      leadsTo: 6,
      refreshedBy: 5,
      notifiedBy: 2,
      links: 2,
      recipients: 1,
      catches: 1,
      omits: 1,
      redirects: 2,
    });
  });

  test('includes: приложение → сторис и уведомление, сторис → экран', () => {
    expect(pairs('includes')).toEqual([
      'exampleStub -> exampleUi/todo/finishTasks',
      'exampleStub -> exampleUi/todo/followAssigned',
      'exampleStub -> exampleUi/todo/planTasks',
      'exampleStub -> exampleUi/todo/taskAssigned',
      `exampleStub -> ${COMPLETED}`,
      `exampleUi/todo/finishTasks -> ${CARD}`,
      `exampleUi/todo/finishTasks -> ${SCREEN}`,
      `exampleUi/todo/followAssigned -> ${ASSIGNED}`,
      `exampleUi/todo/planTasks -> ${SCREEN}`,
      `exampleUi/todo/startWork -> ${MENU}`,
      'exampleUi/users/viewUser -> exampleUi/users/userCard',
    ]);
  });

  test('leads, requires и omits — связи сторис, правило домена, отрезанная сторис', () => {
    expect(pairs('leads')).toEqual([
      'exampleUi/todo/followAssigned -> exampleUi/users/viewUser',
      'exampleUi/todo/startWork -> exampleUi/todo/finishTasks',
      'exampleUi/todo/startWork -> exampleUi/todo/followAssigned',
      'exampleUi/todo/startWork -> exampleUi/todo/planTasks',
      'exampleUi/users/viewUser -> exampleUi/todo/planTasks',
    ]);
    expect(pairs('requires')).toEqual([
      'exampleUi/todo/planTasks -> example/todo/task/withinOpenLimit',
    ]);
    expect(pairs('omits')).toEqual(['exampleStub -> exampleUi/users/viewUser']);
  });

  test('redirects — сторис → экран цели-адреса; цели back и home ребра не дают', () => {
    expect(pairs('redirects')).toEqual([
      `exampleUi/todo/finishTasks -> ${SCREEN}`,
      `exampleUi/todo/planTasks -> ${SCREEN}`,
    ]);
    expect(graph.outgoing('exampleUi/todo/startWork', 'redirects')).toEqual([]);
  });

  test('entry — приложение → экраны входов', () => {
    expect(pairs('entry')).toEqual([
      `exampleStub -> ${ASSIGNED}`,
      `exampleStub -> ${SCREEN}`,
    ]);
  });

  test('reads — экран и уведомление → query UC домена, не внешние', () => {
    expect(pairs('reads')).toEqual([
      `${ASSIGNED} -> example/todo/listAssignedTasks`,
      'exampleUi/todo/taskAssigned -> example/todo/listAssignedTasks',
      `${CARD} -> example/todo/listTasks`,
      `${COMPLETED} -> example/todo/listAssignedTasks`,
      `${SCREEN} -> example/todo/listTasks`,
      'exampleUi/users/userCard -> example/users/getUser',
    ]);
    expect(graph.externals()).toEqual([]);
  });

  test('invokes — действие → command UC, только при uc', () => {
    expect(pairs('invokes')).toEqual([
      `${ASSIGNED}/completeSelected -> example/todo/completeTasks`,
      `${CARD}/assign -> example/todo/assignTask`,
      `${CARD}/complete -> example/todo/completeTask`,
      `${SCREEN}/completeSelected -> example/todo/completeTasks`,
      `${SCREEN}/create -> example/todo/createTask`,
    ]);
  });

  test('leadsTo — действие → экран, переход на свой экран без ребра', () => {
    expect(pairs('leadsTo')).toEqual([
      `${ASSIGNED}/openAssignee -> exampleUi/users/userCard`,
      `${MENU}/assigned -> ${ASSIGNED}`,
      `${MENU}/tasks -> ${SCREEN}`,
      `${CARD}/back -> ${SCREEN}`,
      `${SCREEN}/open -> ${CARD}`,
      `exampleUi/users/userCard/tasks -> ${SCREEN}`,
    ]);
  });

  test('notifiedBy, links, recipients и catches — события, экраны, UC и ошибки домена', () => {
    expect(pairs('notifiedBy')).toEqual([
      'exampleUi/todo/taskAssigned -> example/todo/task/assigned',
      `${COMPLETED} -> example/todo/task/completed`,
    ]);
    expect(pairs('links')).toEqual([
      `exampleUi/todo/taskAssigned -> ${ASSIGNED}`,
      `${COMPLETED} -> ${ASSIGNED}`,
    ]);
    expect(pairs('recipients')).toEqual([
      `${COMPLETED} -> example/todo/getTaskAssignee`,
    ]);
    expect(pairs('catches')).toEqual([
      `${SCREEN} -> example/todo/task/TASK_TOO_MANY_OPEN`,
    ]);
  });

  // Запись `any` — в сцене «две записи refresh на одно событие» ниже (в
  // примере её нет).
  test('refreshedBy: запись — params и subject', () => {
    expect(pairs('refreshedBy')).toEqual([
      `${ASSIGNED} -> example/todo/task/assigned`,
      `${ASSIGNED} -> example/todo/task/unassigned`,
      `${CARD} -> example/todo/task/completed`,
      `${SCREEN} -> example/todo/task/completed`,
      `${SCREEN} -> example/todo/task/created`,
    ]);
    expect(
      edgeProps('refreshedBy', CARD, 'example/todo/task/completed'),
    ).toEqual({
      records: [
        { params: { taskId: 'taskId' }, subject: 'ownerId', any: false },
      ],
    });
    expect(
      edgeProps('refreshedBy', ASSIGNED, 'example/todo/task/assigned'),
    ).toEqual({
      records: [{ params: {}, subject: 'assigneeId', any: false }],
    });
  });

  test('две записи refresh на одно событие — одно ребро со списком records', () => {
    const screen = UiScene.screen('a', {
      refresh: [
        { event: TaskEvents.created, subject: 'ownerId' },
        { event: TaskEvents.created, any: true },
      ],
    });
    const scene = new UiScene({ screens: [screen] });
    const built = new AppGraph(scene.arch()).build();
    const edges = built.outgoing('miniUi/todo/a', 'refreshedBy');

    expect(edges).toHaveLength(1);
    expect(edges[0]?.props).toEqual({
      records: [
        { params: {}, subject: 'ownerId', any: false },
        { params: {}, any: true },
      ],
    });
  });

  test('несколько входов на один экран — одно ребро entry, имена — в props приложения', () => {
    const screen = UiScene.screen('a');
    const scene = new UiScene({
      screens: [screen],
      entries: { one: UiScene.entry(screen), two: UiScene.entry(screen) },
    });
    const built = new AppGraph(scene.arch()).build();

    expect(built.outgoing('miniConsole', 'entry')).toHaveLength(1);
    expect(built.node('miniConsole')?.props).toMatchObject({
      entries: [{ name: 'one' }, { name: 'two' }],
    });
  });
});

describe('UiGraphProvider: получатели из query UC', () => {
  test('recipients — уведомление → query UC получателей, не reads', () => {
    const notification = UiScene.notification('n', {
      recipients: {
        from: 'query',
        uc: GetTaskUcDef,
        input: { taskId: 'taskId' },
        fields: ['ownerId'],
      },
    });
    const scene = new UiScene({ screens: [], notifications: [notification] });
    const built = new AppGraph({
      def: ExampleAppDef,
      providers: [
        new UiGraphProvider({
          set: scene.set,
          apps: [scene.app],
          channels: [],
        }),
      ],
    }).build();
    const targets = (kind: string) =>
      built.outgoing('miniUi/todo/n', kind).map((edge) => edge.to);

    expect(targets('recipients')).toEqual(['example/todo/getTask']);
    expect(targets('reads')).toEqual(['example/todo/listTasks']);
  });
});

describe('UiGraphProvider: действия в графе', () => {
  test('узлы action лежат под своим экраном', () => {
    const actions = graph
      .children(SCREEN)
      .filter((node) => node.kind === 'action');

    expect(actions.map((node) => node.id)).toEqual([
      `${SCREEN}/close`,
      `${SCREEN}/completeSelected`,
      `${SCREEN}/create`,
      `${SCREEN}/jumpTo`,
      `${SCREEN}/next`,
      `${SCREEN}/open`,
      `${SCREEN}/prev`,
    ]);
  });

  test('graph.json содержит узлы действий с подписями и visible', () => {
    const json = appGraph().document(UI_VERSION).toJSON();
    const create = json.nodes.find((n) => n.id === `${SCREEN}/create`);

    expect(json.nodes.filter((n) => n.kind === 'action')).toHaveLength(19);
    expect(create).toMatchObject({
      kind: 'action',
      label: 'Создать задачу',
      description: 'Новая задача в списке.',
      visible: true,
      provider: 'dmg-ui',
    });
  });
});

describe('UiGraphProvider: документ', () => {
  test('два прогона на независимых наборах поставщиков дают одну строку', () => {
    const first = appGraph().document(UI_VERSION).serialize();
    const again = appGraph().document(UI_VERSION).serialize();

    expect(again).toBe(first);
  });

  test('поставщики документа — dmg-core и dmg-ui, образца экрана нет', () => {
    const names = appGraph()
      .document(UI_VERSION)
      .toJSON()
      .providers.map((p) => p.name);

    expect(names).toEqual(['dmg-core', 'dmg-ui']);
  });

  test('имя поставщика — dmg-ui, версия равна version из package.json', () => {
    const file = join(import.meta.dir, '../../../../package.json');
    const { version } = v.parse(
      v.object({ version: v.string() }),
      JSON.parse(readFileSync(file, 'utf8')),
    );

    expect(provider().name).toBe('dmg-ui');
    expect(provider().version).toBe(version);
    expect(UI_VERSION).toBe(version);
  });

  test('образец ScreenProvider dmg-core несовместим: виды uiApp и screen — duplicate-kind', () => {
    const together = new AppGraph({
      def: ExampleAppDef,
      providers: [
        provider(),
        new ScreenProvider(ExampleAppDef, [TasksScreenDef]),
      ],
    });

    expect(() => together.build()).toThrow(GraphError);
    expect(() => together.build()).toThrow(
      expect.objectContaining({ code: 'duplicate-kind' }),
    );
  });
});

describe('UiGraphProvider: ошибки UiIds в графе', () => {
  const twin = ScreenDef.define({
    name: 'taskList',
    label: 'Двойник',
    description: 'Экран с тем же именем.',
    reads: [],
    data: v.object({}),
  });
  const module = (name: string, screens: AnyScreenDef[]) =>
    UiModuleDef.define({
      name,
      label: 'Задачи',
      description: 'Модуль с экранами.',
      screens,
      stories: [],
    });

  test('повтор id экрана — в arch:check ARC-13 «граф не собран»', () => {
    const set = UiSetDef.define({
      name: 'twins',
      label: 'Повтор',
      description: 'Набор с повтором id экрана.',
      app: ExampleAppDef,
      modules: [module('todo', [TaskListScreenDef, twin])],
    });

    const report = ArchReport.of(UiScene.appOf(set, []));

    expect(report.code).toBe(1);
    expect(report.rule('ARC-13')).toEqual([
      expect.stringContaining('ARC-13: граф приложения example не собран'),
    ]);
  });

  test('экран в двух модулях — в arch:check ARC-13 «граф не собран»', () => {
    const set = UiSetDef.define({
      name: 'shared',
      label: 'Общий экран',
      description: 'Один Def экрана в двух модулях.',
      app: ExampleAppDef,
      modules: [
        module('first', [TaskCardScreenDef]),
        module('second', [TaskCardScreenDef]),
      ],
    });

    const report = ArchReport.of(UiScene.appOf(set, []));

    expect(report.rule('ARC-13')).toEqual([
      expect.stringContaining('граф приложения example не собран'),
    ]);
  });
});

describe('UiGraphProvider: связи, доступ и правила сторис', () => {
  const card = UiScene.screen('card');
  const view = UiScene.story('view', [card]);
  const jump = { actions: { open: UiScene.jump(card) } };
  const [plan, done] = [
    UiScene.screen('planScreen', jump),
    UiScene.screen('doneScreen', jump),
  ];
  const lead = { leads: () => [view] };
  const planStory = UiScene.story('plan', [plan], lead);
  const doneStory = UiScene.story('done', [done], lead);
  const stories = [planStory, doneStory, view];
  const graphOf = (scene: UiScene) => new AppGraph(scene.arch()).build();
  const both = () =>
    graphOf(new UiScene({ screens: [plan, done, card], stories }));
  const ids = (edges: readonly { from: string; to: string }[]) =>
    edges.map((edge) => `${edge.from} -> ${edge.to}`).toSorted();

  test('связь — ребро leads от каждого источника; у сторис из двух мест один узел', () => {
    const built = both();
    const nodes = built.nodes().filter((n) => n.id === 'miniUi/todo/view');

    expect(nodes).toHaveLength(1);
    expect(ids(built.incoming('miniUi/todo/view', 'leads'))).toEqual([
      'miniUi/todo/done -> miniUi/todo/view',
      'miniUi/todo/plan -> miniUi/todo/view',
    ]);
    expect(built.edges().filter((e) => e.kind === 'leads')).toHaveLength(2);
  });

  test('правило сторис — ребро requires к правилу домена, не внешнее', () => {
    const story = UiScene.story('limited', [card], {
      rules: [TaskRules.rules.withinOpenLimit],
    });
    const built = graphOf(new UiScene({ screens: [card], stories: [story] }));

    expect(ids(built.outgoing('miniUi/todo/limited', 'requires'))).toEqual([
      'miniUi/todo/limited -> example/todo/task/withinOpenLimit',
    ]);
    expect(built.externals()).toEqual([]);
  });

  test('access — свойство узла сторис: свёрнутое правило домена', () => {
    const managed = UiScene.story('managed', [card], {
      access: TaskPolicy.rules.canManage,
    });
    const plain = UiScene.story('plain', [card]);
    const built = graphOf(
      new UiScene({ screens: [card], stories: [managed, plain] }),
    );

    expect(built.node('miniUi/todo/managed')?.props).toMatchObject({
      access: TaskPolicy.rules.canManage.normalize(),
    });
    expect(built.node('miniUi/todo/plain')?.props).not.toHaveProperty('access');
  });

  test('приложение без цели связи — ребро omits к ней, переход виден как leadsTo', () => {
    const scene = new UiScene({
      screens: [plan, done, card],
      stories,
      appStories: [planStory],
    });
    const built = graphOf(scene);

    expect(ids(built.outgoing('miniConsole', 'omits'))).toEqual([
      'miniConsole -> miniUi/todo/view',
    ]);
    expect(
      ids(built.outgoing('miniUi/todo/planScreen/open', 'leadsTo')),
    ).toEqual(['miniUi/todo/planScreen/open -> miniUi/todo/card']);
  });

  test('приложение с обеими сторис — рёбер omits нет', () => {
    const scene = new UiScene({
      screens: [plan, done, card],
      stories,
      appStories: [planStory, view],
    });

    expect(graphOf(scene).outgoing('miniConsole', 'omits')).toEqual([]);
  });
});

describe('UiGraphProvider: дерево приложения — roots и согласие с рёбрами', () => {
  const START_WORK = 'exampleUi/todo/startWork';
  const menuGraph = new AppGraph({
    def: ExampleAppDef,
    providers: [
      new UiGraphProvider({
        set: ExampleUiSetDef,
        apps: [ExampleMenuStubUiAppDef, ExampleMenuTrimmedStubUiAppDef],
        channels: [],
      }),
    ],
  }).build();
  const apps = [
    ['exampleMenuStub', ExampleMenuStubUiAppDef],
    ['exampleMenuTrimmedStub', ExampleMenuTrimmedStubUiAppDef],
  ] as const;
  const leadsOf = (g: typeof menuGraph) =>
    new Set(
      g
        .edges()
        .filter((e) => e.kind === 'leads')
        .map((e) => `${e.from} -> ${e.to}`),
    );
  const pairsOf = (branches: readonly StoryBranch[]): string[] =>
    branches.flatMap((b) => [
      ...b.children.map((c) => `${b.id} -> ${c.id}`),
      ...pairsOf(b.children),
    ]);

  test('props.roots приложения с меню — корень startWork', () => {
    expect(menuGraph.node('exampleMenuStub')?.props).toMatchObject({
      roots: [START_WORK],
    });
  });

  test('props.roots урезанного приложения с меню — тоже startWork', () => {
    expect(menuGraph.node('exampleMenuTrimmedStub')?.props).toMatchObject({
      roots: [START_WORK],
    });
  });

  test('props.roots приложения без меню — все три сторис задач в порядке приложения', () => {
    expect(props('exampleStub')).toMatchObject({
      roots: [
        'exampleUi/todo/planTasks',
        'exampleUi/todo/finishTasks',
        'exampleUi/todo/followAssigned',
      ],
    });
  });

  test('приложение без сторис: roots — пустой массив, ключ есть', () => {
    const scene = new UiScene({ screens: [UiScene.screen('a')] });
    const built = new AppGraph(scene.arch()).build();

    expect(built.node('miniConsole')?.props).toHaveProperty('roots', []);
  });

  for (const [id, app] of apps) {
    test(`${id}: roots равны корням дерева`, () => {
      expect(menuGraph.node(id)?.props).toMatchObject({
        roots: StoryTree.of(app)
          .roots()
          .map((b) => b.id),
      });
    });

    test(`${id}: каждая пара «родитель → ребёнок» дерева — ребро leads`, () => {
      const edges = leadsOf(menuGraph);
      const pairs = pairsOf(StoryTree.of(app).roots());

      expect(pairs).not.toEqual([]);
      for (const pair of pairs) expect(edges.has(pair)).toBe(true);
    });

    test(`${id}: каждый omitted дерева — ребро omits от приложения`, () => {
      const omits = menuGraph.outgoing(id, 'omits').map((e) => e.to);

      expect(
        StoryTree.of(app)
          .omitted()
          .map((o) => o.id)
          .toSorted(),
      ).toEqual(omits.toSorted());
    });
  }

  test('урезанный состав: omits — viewUser, полный состав — без omits', () => {
    expect(menuGraph.outgoing('exampleMenuStub', 'omits')).toEqual([]);
    expect(
      menuGraph.outgoing('exampleMenuTrimmedStub', 'omits').map((e) => e.to),
    ).toEqual(['exampleUi/users/viewUser']);
  });

  test('сцена с циклом: roots графа равны корням дерева', () => {
    const a = UiScene.screen('aScreen');
    const b = UiScene.screen('bScreen');
    const storyB: ReturnType<typeof UiScene.story> = UiScene.story('b', [b], {
      leads: () => [storyA],
    });
    const storyA: ReturnType<typeof UiScene.story> = UiScene.story('a', [a], {
      leads: () => [storyB],
    });
    const scene = new UiScene({
      screens: [a, b],
      stories: [storyA, storyB],
      appStories: [storyB, storyA],
    });
    const built = new AppGraph(scene.arch()).build();

    expect(built.node('miniConsole')?.props).toMatchObject({
      roots: ['miniUi/todo/b'],
    });
  });
});

describe('UiGraphProvider: вид поля читается из JSON Schema', () => {
  const props0 = (g: typeof graph, id: string) => {
    const found = g.node(id);
    if (!found) throw new Error(`нет узла ${id}`);
    return found.props;
  };
  test('число, булево, дата и выбор — type, format и enum схемы входа', () => {
    const input = v.object({
      count: v.pipe(v.number(), v.description('Число')),
      done: v.pipe(v.boolean(), v.description('Признак')),
      day: v.pipe(v.string(), v.isoDate(), v.description('Дата')),
      level: v.pipe(v.picklist(['low', 'high']), v.description('Уровень')),
    });
    const screen = UiScene.screen('a', {
      actions: {
        go: { label: 'Идти', description: 'Ввод.', input },
      },
    });
    const built = new AppGraph(
      new UiScene({ screens: [screen] }).arch(),
    ).build();

    const properties = (
      props0(built, 'miniUi/todo/a/go') as unknown as {
        input: { properties: Record<string, Record<string, unknown>> };
      }
    ).input.properties;

    expect(properties.count).toMatchObject({ type: 'number' });
    expect(properties.done).toMatchObject({ type: 'boolean' });
    expect(properties.day).toMatchObject({ type: 'string', format: 'date' });
    expect(properties.level).toMatchObject({ enum: ['low', 'high'] });
  });
});

describe('UiGraphProvider: имена модулей и каналов против слоёв фронта', () => {
  const module = (name: string, screens: AnyScreenDef[] = []) =>
    UiModuleDef.define({
      name,
      label: `Модуль ${name}`,
      description: 'Модуль для проверки имён слоёв.',
      screens,
      stories: [],
    });
  const setOf = (...modules: ReturnType<typeof module>[]) =>
    UiSetDef.define({
      name: 'named',
      label: 'Имена',
      description: 'Набор для проверки имён модулей.',
      app: ExampleAppDef,
      modules,
    });
  const todo = setOf(module('todo'));
  /** Текст отказа сборки; сборка прошла — пустая строка. */
  const refusal = (build: () => unknown): string => {
    try {
      build();
      return '';
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  };

  test('UI-модуль app — отказ сборки: текст называет модуль и занятый слой fe-app', () => {
    const message = refusal(
      () =>
        new UiGraphProvider({
          set: setOf(module('todo'), module('app')),
          apps: [],
          channels: [],
        }),
    );

    expect(message).toContain('fe-app');
    // Имя модуля — отдельно от имени слоя, в котором оно тоже есть.
    expect(message.replaceAll('fe-app', '')).toContain('app');
  });

  test('UI-модуль dialog-kit при канале dialog — отказ сборки', () => {
    const build = () =>
      new UiGraphProvider({
        set: setOf(module('todo'), module('dialog-kit')),
        apps: [],
        channels: [{ name: 'dialog' }],
      });

    expect(build).toThrow('dialog-kit');
  });

  test('UI-модуль dialog-kit без канала dialog — сборка проходит', () => {
    const build = () =>
      new UiGraphProvider({
        set: setOf(module('todo'), module('dialog-kit')),
        apps: [],
        channels: [{ name: 'site' }],
      });

    expect(build).not.toThrow();
  });

  test('два UI-модуля с одним именем — слой кода без повтора, в arch:check ARC-13 «граф не собран», а не исключение', () => {
    const set = setOf(
      module('todo', [UiScene.screen('first')]),
      module('todo', [UiScene.screen('second')]),
    );
    const layers = new UiGraphProvider({
      set,
      apps: [],
      channels: [],
    }).layers();

    expect(layers.find((l) => l.name === 'fe-logic')?.perModule).toEqual([
      'todo',
    ]);
    expect(ArchReport.of(UiScene.appOf(set, [])).rule('ARC-13')).toEqual([
      expect.stringContaining('граф приложения example не собран'),
    ]);
  });

  test('канал app — отказ: имя занято слоем fe-app', () => {
    const message = refusal(
      () =>
        new UiGraphProvider({
          set: todo,
          apps: [],
          channels: [{ name: 'app' }],
        }),
    );

    expect(message).toContain('fe-app');
  });

  test('канал logic — отказ: имя занято слоем fe-logic', () => {
    const message = refusal(
      () =>
        new UiGraphProvider({
          set: todo,
          apps: [],
          channels: [{ name: 'logic' }],
        }),
    );

    expect(message).toContain('fe-logic');
  });

  test('канал объявлен дважды — отказ сборки с именем канала', () => {
    const build = () =>
      new UiGraphProvider({
        set: todo,
        apps: [],
        channels: [{ name: 'dialog' }, { name: 'dialog' }],
      });

    expect(build).toThrow('dialog');
  });

  test('база канала не объявлена — отказ сборки с именем канала', () => {
    const build = () =>
      new UiGraphProvider({
        set: todo,
        apps: [],
        channels: [{ name: 'voice', base: 'dialog' }],
      });

    expect(build).toThrow('voice');
  });

  test('база канала — сам канал — отказ сборки', () => {
    const build = () =>
      new UiGraphProvider({
        set: todo,
        apps: [],
        channels: [{ name: 'dialog', base: 'dialog' }],
      });

    expect(build).toThrow('dialog');
  });
});
