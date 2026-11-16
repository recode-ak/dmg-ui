import { describe, expect, test } from 'bun:test';
import { AppGraph } from 'dmg-core/graph';
import { ExampleArch } from 'dmg-core/testing';
import { UiGraphProvider } from 'dmg-ui/graph';
import { ExampleUiSetDef } from '../../example';
import {
  ExamplePagesAppDef,
  ExamplePagesArch,
  examplePageRoutes,
  examplePageViews,
} from '../../example/pages';
import { PAGE_CHANNEL, PAGE_VERSION } from '../page-channel.const';
import { PageGraphProvider } from './page-graph-provider';
import { PageRouteDef } from './page-route-def';

// Второй поставщик графа — страничный канал `dmg-ui-pages` (образец —
// `dmg-core/testing/example/screen`): свой вид узла `pageRoute`, ребро
// `opens` и рёбра `presents` приложения к представлениям.

const graph = () => new AppGraph(ExamplePagesArch).build();
const TASKS = 'examplePages/tasks';
const ASSIGNED = 'examplePages/assigned';

const ownEdges = (kind: string) =>
  graph()
    .edges()
    .filter((edge) => edge.provider === 'dmg-ui-pages' && edge.kind === kind)
    .map((edge) => `${edge.from} -> ${edge.to}`)
    .sort();

describe('PageGraphProvider: узлы', () => {
  test('канал и поставщик называются dmg-ui-pages', () => {
    expect(PAGE_CHANNEL).toBe('dmg-ui-pages');
    expect(PAGE_VERSION).toBe('0.1.0');
    expect(ExamplePagesAppDef.channel).toBe(PAGE_CHANNEL);
  });

  test('маршруты tasks и assigned — узлы вида pageRoute под приложением examplePages', () => {
    const own = graph()
      .nodes()
      .filter((node) => node.provider === 'dmg-ui-pages');

    expect(own.map((node) => node.id).sort()).toEqual([ASSIGNED, TASKS]);
    expect(graph().node(TASKS)).toMatchObject({
      kind: 'pageRoute',
      parent: 'examplePages',
      provider: 'dmg-ui-pages',
      props: { path: '/', entry: 'start' },
    });
    expect(graph().node(ASSIGNED)).toMatchObject({
      kind: 'pageRoute',
      parent: 'examplePages',
      provider: 'dmg-ui-pages',
      props: { path: '/assigned', entry: 'assigned' },
    });
  });

  test('подпись, описание и видимость узла — из PageRouteDef', () => {
    const route = examplePageRoutes.find((r) => r.name === 'tasks');

    expect(graph().node(TASKS)).toMatchObject({
      label: route?.label,
      description: route?.description,
      visible: route?.visible,
    });
  });

  test('виды поставщика: узел pageRoute и ребро opens', () => {
    const provider = new PageGraphProvider({
      app: ExamplePagesAppDef,
      views: examplePageViews,
      routes: examplePageRoutes,
    });
    const kinds = provider.kinds();

    expect(kinds.nodes.map((kind) => kind.kind)).toEqual(['pageRoute']);
    expect(kinds.edges.map((kind) => kind.kind)).toEqual(['opens']);
    expect(provider.name).toBe('dmg-ui-pages');
    expect(provider.version).toBe(PAGE_VERSION);
  });

  test('правила поставщика — PG-01 и PG-02', () => {
    const provider = new PageGraphProvider({
      app: ExamplePagesAppDef,
      views: examplePageViews,
      routes: examplePageRoutes,
    });

    expect(provider.rules?.().map((rule) => rule.id)).toEqual([
      'PG-01',
      'PG-02',
    ]);
  });
});

describe('PageGraphProvider: рёбра', () => {
  test('opens — от маршрута к экрану его входа', () => {
    expect(ownEdges('opens')).toEqual([
      `${ASSIGNED} -> exampleUi/todo/assignedTasks`,
      `${TASKS} -> exampleUi/todo/taskList`,
    ]);
  });

  test('presents — от examplePages к каждому экрану и уведомлению, пять рёбер', () => {
    expect(ownEdges('presents')).toEqual([
      'examplePages -> exampleUi/todo/assignedTasks',
      'examplePages -> exampleUi/todo/taskAssigned',
      'examplePages -> exampleUi/todo/taskCard',
      'examplePages -> exampleUi/todo/taskCompleted',
      'examplePages -> exampleUi/todo/taskList',
    ]);
  });
});

describe('PageGraphProvider: вход не объявлен приложением', () => {
  test('узел маршрута есть, ребра opens нет, имя входа — в свойствах', () => {
    const ghost = PageRouteDef.define({
      name: 'ghost',
      label: 'Призрак',
      description: 'Маршрут на несуществующий вход.',
      path: '/ghost',
      entry: 'nowhere',
    });
    const built = new AppGraph({
      ...ExampleArch,
      providers: [
        new UiGraphProvider({
          set: ExampleUiSetDef,
          apps: [ExamplePagesAppDef],
        }),
        new PageGraphProvider({
          app: ExamplePagesAppDef,
          views: examplePageViews,
          routes: [ghost],
        }),
      ],
    }).build();

    expect(built.node('examplePages/ghost')?.props).toEqual({
      path: '/ghost',
      entry: 'nowhere',
    });
    expect(built.outgoing('examplePages/ghost', 'opens')).toEqual([]);
  });
});

describe('PageGraphProvider: сборка', () => {
  test('повтор path у двух маршрутов — бросок в конструкторе', () => {
    const first = PageRouteDef.define({
      name: 'first',
      label: 'Первый',
      description: 'Первый маршрут.',
      path: '/same',
      entry: 'start',
    });
    const second = PageRouteDef.define({
      name: 'second',
      label: 'Второй',
      description: 'Второй маршрут.',
      path: '/same',
      entry: 'assigned',
    });

    expect(
      () =>
        new PageGraphProvider({
          app: ExamplePagesAppDef,
          views: examplePageViews,
          routes: [first, second],
        }),
    ).toThrow('/same');
  });
});

describe('PageGraphProvider: документ', () => {
  test('два прогона на независимых сборках дают одну строку', () => {
    const first = new AppGraph(ExamplePagesArch)
      .document(PAGE_VERSION)
      .serialize();
    const again = new AppGraph(ExamplePagesArch)
      .document(PAGE_VERSION)
      .serialize();

    expect(again).toBe(first);
  });

  test('поставщики документа — dmg-core, dmg-ui и dmg-ui-pages', () => {
    const names = new AppGraph(ExamplePagesArch)
      .document(PAGE_VERSION)
      .toJSON()
      .providers.map((provider) => provider.name);

    expect(names).toEqual(['dmg-core', 'dmg-ui', 'dmg-ui-pages']);
  });
});
