import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { toJsonSchema } from 'dmg-core';
import { AppGraph, GraphError } from 'dmg-core/graph';
import {
  ExampleAppDef,
  GetTaskUcDef,
  TaskEvents,
} from 'dmg-core/testing/example';
import { ScreenProvider } from 'dmg-core/testing/example/screen/screen-provider';
import { TasksScreenDef } from 'dmg-core/testing/example/screen/tasks.screen';
import * as v from 'valibot';
import { ArchReport, UiScene } from '../../testing/ui-arch';
import {
  ExampleUiAppDef,
  ExampleUiSetDef,
  TaskCardScreenDef,
  TaskListScreenDef,
} from '../../testing/ui-fixture';
import { type AnyScreenDef, ScreenDef } from '../manifest/screen-def';
import { UiModuleDef } from '../manifest/ui-module-def';
import { UiSetDef } from '../manifest/ui-set-def';
import { UiGraphProvider } from './ui-graph-provider';
import { UI_VERSION } from './ui-kinds';

const provider = () =>
  new UiGraphProvider({ set: ExampleUiSetDef, apps: [ExampleUiAppDef] });
const appGraph = () =>
  new AppGraph({ def: ExampleAppDef, providers: [provider()] });
const graph = appGraph().build();
const own = graph.nodes().filter((node) => node.provider === 'dmg-ui');
const ownEdges = graph.edges().filter((edge) => edge.provider === 'dmg-ui');
const SCREEN = 'exampleUi/todo/taskList';
const CARD = 'exampleUi/todo/taskCard';

const pairs = (kind: string) =>
  ownEdges
    .filter((edge) => edge.kind === kind)
    .map((edge) => `${edge.from} -> ${edge.to}`);

const props = (id: string) => graph.node(id)?.props;
const edgeProps = (kind: string, from: string, to: string) =>
  ownEdges.find((e) => e.kind === kind && e.from === from && e.to === to)
    ?.props;

describe('UiGraphProvider: узлы', () => {
  test('15 узлов набора и приложения UI в каноническом порядке', () => {
    expect(own.map((node) => node.id)).toEqual([
      'exampleConsole',
      'exampleUi',
      'exampleUi/todo',
      'exampleUi/todo/finishTasks',
      'exampleUi/todo/planTasks',
      'exampleUi/todo/taskAssigned',
      CARD,
      `${CARD}/assign`,
      `${CARD}/back`,
      `${CARD}/complete`,
      SCREEN,
      `${SCREEN}/completeSelected`,
      `${SCREEN}/create`,
      `${SCREEN}/next`,
      `${SCREEN}/open`,
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
    ).toEqual({ uiSet: 1, uiModule: 1, screen: 2, story: 2, notification: 1 });
    expect(count('action')).toBe(7);
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
      'exampleConsole',
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

  test('виды поставщика в документе: узлы и рёбра, включая presents', () => {
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
      'leadsTo',
      'links',
      'notifiedBy',
      'presents',
      'reads',
      'recipients',
      'refreshedBy',
    ]);
  });
});

describe('UiGraphProvider: свойства узлов', () => {
  test('экран taskList: схемы, основное действие, локальные, выходы, примеры', () => {
    expect(props(SCREEN)).toEqual({
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
      examples: [],
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
        },
        {
          name: 'closed',
          label: 'Список закрыт',
          description: 'Пользователь закрыл список, не добавив задачу.',
          exits: [{ screen: SCREEN, exit: 'closed' }],
        },
      ],
    });
  });

  test('приложение UI: набор, канал и входы с адресом экрана', () => {
    expect(props('exampleConsole')).toEqual({
      set: 'exampleUi',
      channel: 'dmg-ui-console',
      entries: [
        {
          name: 'start',
          label: 'Начало',
          description: 'Список задач с начала.',
          screen: SCREEN,
          params: { index: 0 },
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
  });
});

describe('UiGraphProvider: рёбра', () => {
  test('рёбра поставщика: 22 штуки, по видам', () => {
    const counts: Record<string, number> = {};
    for (const edge of ownEdges)
      counts[edge.kind] = (counts[edge.kind] ?? 0) + 1;

    expect(ownEdges).toHaveLength(22);
    expect(counts).toEqual({
      includes: 6,
      entry: 1,
      reads: 3,
      invokes: 4,
      leadsTo: 2,
      refreshedBy: 3,
      notifiedBy: 1,
      links: 1,
      catches: 1,
    });
  });

  test('includes: приложение → сторис и уведомление, сторис → экран', () => {
    expect(pairs('includes')).toEqual([
      'exampleConsole -> exampleUi/todo/finishTasks',
      'exampleConsole -> exampleUi/todo/planTasks',
      'exampleConsole -> exampleUi/todo/taskAssigned',
      `exampleUi/todo/finishTasks -> ${CARD}`,
      `exampleUi/todo/finishTasks -> ${SCREEN}`,
      `exampleUi/todo/planTasks -> ${SCREEN}`,
    ]);
  });

  test('entry — приложение → экран входа', () => {
    expect(pairs('entry')).toEqual([`exampleConsole -> ${SCREEN}`]);
  });

  test('reads — экран и уведомление → query UC домена, не внешние', () => {
    expect(pairs('reads')).toEqual([
      'exampleUi/todo/taskAssigned -> example/todo/listTasks',
      `${CARD} -> example/todo/listTasks`,
      `${SCREEN} -> example/todo/listTasks`,
    ]);
    expect(graph.externals()).toEqual([]);
  });

  test('invokes — действие → command UC, только при uc', () => {
    expect(pairs('invokes')).toEqual([
      `${CARD}/assign -> example/todo/assignTask`,
      `${CARD}/complete -> example/todo/completeTask`,
      `${SCREEN}/completeSelected -> example/todo/completeTask`,
      `${SCREEN}/create -> example/todo/createTask`,
    ]);
  });

  test('leadsTo — действие → экран, переход на свой экран без ребра', () => {
    expect(pairs('leadsTo')).toEqual([
      `${CARD}/back -> ${SCREEN}`,
      `${SCREEN}/open -> ${CARD}`,
    ]);
  });

  test('notifiedBy, links и catches — события, экраны и ошибки домена', () => {
    expect(pairs('notifiedBy')).toEqual([
      'exampleUi/todo/taskAssigned -> example/todo/task/assigned',
    ]);
    expect(pairs('links')).toEqual([`exampleUi/todo/taskAssigned -> ${CARD}`]);
    expect(pairs('catches')).toEqual([
      `${SCREEN} -> example/todo/task/TASK_TOO_MANY_OPEN`,
    ]);
  });

  test('refreshedBy: запись — params, subject и any', () => {
    expect(pairs('refreshedBy')).toEqual([
      `${CARD} -> example/todo/task/completed`,
      `${SCREEN} -> example/todo/task/archived`,
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
      edgeProps('refreshedBy', SCREEN, 'example/todo/task/archived'),
    ).toEqual({ records: [{ params: {}, any: true }] });
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

describe('UiGraphProvider: получатели из query UC (С-6 брифа Ф4)', () => {
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
      providers: [new UiGraphProvider({ set: scene.set, apps: [scene.app] })],
    }).build();
    const targets = (kind: string) =>
      built.outgoing('miniUi/todo/n', kind).map((edge) => edge.to);

    expect(targets('recipients')).toEqual(['example/todo/getTask']);
    expect(targets('reads')).toEqual(['example/todo/listTasks']);
  });
});

describe('UiGraphProvider: действия в графе (критерий 13)', () => {
  test('узлы action лежат под своим экраном', () => {
    const actions = graph
      .children(SCREEN)
      .filter((node) => node.kind === 'action');

    expect(actions.map((node) => node.id)).toEqual([
      `${SCREEN}/completeSelected`,
      `${SCREEN}/create`,
      `${SCREEN}/next`,
      `${SCREEN}/open`,
    ]);
  });

  test('graph.json содержит узлы действий с подписями и visible', () => {
    const json = appGraph().document(UI_VERSION).toJSON();
    const create = json.nodes.find((n) => n.id === `${SCREEN}/create`);

    expect(json.nodes.filter((n) => n.kind === 'action')).toHaveLength(7);
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
