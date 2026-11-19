import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppGraph } from 'dmg-core/graph';
import { ExampleArch } from 'dmg-core/testing';
import { ExampleAppDef, ListTasksUcDef } from 'dmg-core/testing/example';
import {
  type AnyUiAppDef,
  ScreenDef,
  UiAppDef,
  UiModuleDef,
  UiSetDef,
} from 'dmg-ui';
import { UiGraphProvider } from 'dmg-ui/graph';
import { ExampleUiSetDef } from 'dmg-ui/testing';
import * as v from 'valibot';
import {
  ExamplePagesAppDef,
  ExamplePagesArch,
  examplePageRoutes,
  examplePageViews,
} from '../../testing';
import { PAGE_CHANNEL, PAGE_VERSION } from '../page-channel.const';
import { PageRouteDef } from '../url/page-route-def';
import { PageGraphProvider } from './page-graph-provider';
import type { PagePresentedViews } from './page-graph-provider.types';

// Второй поставщик графа — страничный канал `dmg-ui-pages` (образец —
// `dmg-core/testing/example/screen`): свой вид узла `pageRoute`, ребро
// `opens` и рёбра `presents` приложения к представлениям.

const PACKAGE_VERSION = v.parse(
  v.object({ version: v.string() }),
  JSON.parse(
    readFileSync(join(import.meta.dir, '../../../../package.json'), 'utf8'),
  ),
).version;

/** Второе приложение того же набора для сцен с несколькими приложениями. */
const SecondAppDef = UiAppDef.define({
  name: 'secondPages',
  label: 'Второе приложение',
  description: 'Второе приложение учебного набора.',
  set: ExampleUiSetDef,
  channel: PAGE_CHANNEL,
  stories: [],
  entries: ExamplePagesAppDef.entries,
});

/** Другой набор UI с одним экраном: приложение и реестр представлений «не того» набора. */
const OtherHomeScreenDef = ScreenDef.define({
  name: 'home',
  label: 'Главная',
  description: 'Единственный экран другого набора.',
  reads: [ListTasksUcDef],
  data: v.object({}),
});
const OtherSetDef = UiSetDef.define({
  name: 'otherUi',
  label: 'Другой набор',
  description: 'Набор UI, не равный учебному.',
  app: ExampleAppDef,
  modules: [
    UiModuleDef.define({
      name: 'other',
      label: 'Другой',
      description: 'Модуль другого набора.',
      screens: [OtherHomeScreenDef],
      stories: [],
    }),
  ],
});
const OtherAppDef = UiAppDef.define({
  name: 'otherPages',
  label: 'Другое приложение',
  description: 'Приложение другого набора.',
  set: OtherSetDef,
  channel: PAGE_CHANNEL,
  stories: [],
  entries: {
    start: {
      label: 'Вход',
      description: 'Вход другого набора.',
      address: OtherHomeScreenDef.at({}),
    },
  },
});
const OTHER_VIEWS = { set: OtherSetDef, presented: () => [] };

const graph = () => new AppGraph(ExamplePagesArch).build();
const TASKS = 'examplePages/tasks';
const ASSIGNED = 'examplePages/assigned';
const MENU = 'examplePages/menu';

const ownEdges = (kind: string) =>
  graph()
    .edges()
    .filter((edge) => edge.provider === 'dmg-ui-pages' && edge.kind === kind)
    .map((edge) => `${edge.from} -> ${edge.to}`)
    .sort();

describe('PageGraphProvider: узлы', () => {
  test('канал и поставщик называются dmg-ui-pages', () => {
    expect(PAGE_CHANNEL).toBe('dmg-ui-pages');
    expect(PAGE_VERSION).toBe(PACKAGE_VERSION);
    expect(ExamplePagesAppDef.channel).toBe(PAGE_CHANNEL);
  });

  test('маршруты tasks, assigned и menu — узлы вида pageRoute под приложением examplePages', () => {
    const own = graph()
      .nodes()
      .filter((node) => node.provider === 'dmg-ui-pages');

    expect(own.map((node) => node.id).sort()).toEqual([ASSIGNED, MENU, TASKS]);
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
    expect(graph().node(MENU)).toMatchObject({
      kind: 'pageRoute',
      parent: 'examplePages',
      provider: 'dmg-ui-pages',
      props: { path: '/menu', entry: 'menu' },
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
      apps: [
        {
          app: ExamplePagesAppDef,
          views: examplePageViews,
          routes: examplePageRoutes,
        },
      ],
    });
    const kinds = provider.kinds();

    expect(kinds.nodes.map((kind) => kind.kind)).toEqual(['pageRoute']);
    expect(kinds.edges.map((kind) => kind.kind)).toEqual(['opens']);
    expect(provider.name).toBe('dmg-ui-pages');
    expect(provider.version).toBe(PAGE_VERSION);
    expect(provider.version).toBe(PACKAGE_VERSION);
  });

  test('правила поставщика — PG-01…PG-07 по порядку', () => {
    const provider = new PageGraphProvider({
      apps: [
        {
          app: ExamplePagesAppDef,
          views: examplePageViews,
          routes: examplePageRoutes,
        },
      ],
    });

    expect(provider.rules?.().map((rule) => rule.id)).toEqual([
      'PG-01',
      'PG-02',
      'PG-03',
      'PG-04',
      'PG-05',
      'PG-06',
      'PG-07',
    ]);
  });
});

describe('PageGraphProvider: рёбра', () => {
  test('opens — от маршрута к экрану его входа', () => {
    expect(ownEdges('opens')).toEqual([
      `${ASSIGNED} -> exampleUi/todo/assignedTasks`,
      `${MENU} -> exampleUi/todo/mainMenu`,
      `${TASKS} -> exampleUi/todo/taskList`,
    ]);
  });

  test('presents — от examplePages к каждому экрану и уведомлению реестра, семь рёбер', () => {
    expect(ownEdges('presents')).toEqual([
      'examplePages -> exampleUi/todo/assignedTasks',
      'examplePages -> exampleUi/todo/mainMenu',
      'examplePages -> exampleUi/todo/taskAssigned',
      'examplePages -> exampleUi/todo/taskCard',
      'examplePages -> exampleUi/todo/taskCompleted',
      'examplePages -> exampleUi/todo/taskList',
      'examplePages -> exampleUi/users/userCard',
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
          apps: [
            {
              app: ExamplePagesAppDef,
              views: examplePageViews,
              routes: [ghost],
            },
          ],
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

describe('PageGraphProvider: сборка — броски только структуры спеки', () => {
  const spec = (
    app: AnyUiAppDef = ExamplePagesAppDef,
    views: PagePresentedViews = examplePageViews,
  ) => ({
    app,
    views,
    routes: examplePageRoutes,
  });

  test('приложение указано дважды — бросок', () => {
    expect(() => new PageGraphProvider({ apps: [spec(), spec()] })).toThrow(
      'PageGraphProvider: приложение examplePages указано дважды',
    );
  });

  test('реестр представлений другого набора — бросок с именем приложения', () => {
    expect(
      () =>
        new PageGraphProvider({
          apps: [spec(ExamplePagesAppDef, OTHER_VIEWS)],
        }),
    ).toThrow(
      'PageGraphProvider: реестр представлений приложения examplePages — не для набора приложения',
    );
  });

  test('приложения на разных наборах UI — бросок', () => {
    expect(
      () =>
        new PageGraphProvider({
          apps: [spec(), spec(OtherAppDef, OTHER_VIEWS)],
        }),
    ).toThrow('PageGraphProvider: приложения на разных наборах UI');
  });

  test('повтор пути у двух маршрутов поставщик не бросает: это правило PG-04', () => {
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
          apps: [
            {
              app: ExamplePagesAppDef,
              views: examplePageViews,
              routes: [first, second],
            },
          ],
        }),
    ).not.toThrow();
  });

  test('contribute: узлы маршрутов двух приложений — одним списком', () => {
    const provider = new PageGraphProvider({
      apps: [
        spec(),
        {
          app: SecondAppDef,
          views: examplePageViews,
          routes: examplePageRoutes,
        },
      ],
    });

    expect(
      provider
        .contribute()
        .nodes.map((node) => node.id)
        .sort(),
    ).toEqual([
      'examplePages/assigned',
      'examplePages/menu',
      'examplePages/tasks',
      'secondPages/assigned',
      'secondPages/menu',
      'secondPages/tasks',
    ]);
  });

  test('contribute: маршруты, рёбра opens и presents каждого приложения — свои', () => {
    const only = PageRouteDef.define({
      name: 'only',
      label: 'Единственный',
      description: 'Единственный маршрут второго приложения.',
      path: '/only',
      entry: 'assigned',
    });
    const presented = ['exampleUi/todo/taskCard'];
    const contribution = new PageGraphProvider({
      apps: [
        spec(),
        {
          app: SecondAppDef,
          views: { set: ExampleUiSetDef, presented: () => presented },
          routes: [only],
        },
      ],
    }).contribute();

    const opens = contribution.edges
      .filter((edge) => edge.kind === 'opens')
      .map((edge) => `${edge.from} -> ${edge.to}`)
      .sort();
    const second = contribution.edges
      .filter((edge) => edge.kind === 'presents' && edge.from === 'secondPages')
      .map((edge) => edge.to);

    expect(contribution.nodes.map((node) => node.id).sort()).toEqual([
      'examplePages/assigned',
      'examplePages/menu',
      'examplePages/tasks',
      'secondPages/only',
    ]);
    expect(opens).toEqual([
      'examplePages/assigned -> exampleUi/todo/assignedTasks',
      'examplePages/menu -> exampleUi/todo/mainMenu',
      'examplePages/tasks -> exampleUi/todo/taskList',
      'secondPages/only -> exampleUi/todo/assignedTasks',
    ]);
    expect(second).toEqual(presented);
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
