import { describe, expect, test } from 'bun:test';
import { F } from 'dmg-core';
import { Graph } from 'dmg-core/graph';
import { ExampleAppDef, ListTasksUcDef } from 'dmg-core/testing/example';
import {
  type Address,
  type AnyUiAppDef,
  type AnyUiSetDef,
  ScreenDef,
  type StrictSchema,
  UiAppDef,
  UiModuleDef,
  UiSetDef,
} from 'dmg-ui';
import {
  AssignedTasksScreenDef,
  ExampleUiSetDef,
  FinishTasksStoryDef,
  FollowAssignedStoryDef,
  PlanTasksStoryDef,
  TaskAssignedNotificationDef,
  TaskCompletedNotificationDef,
  TaskListScreenDef,
} from 'dmg-ui/testing';
import { ArchReport, UiScene } from 'dmg-ui/testing/fixtures';
import * as v from 'valibot';
import { ExamplePagesAppDef, examplePageViews } from '../../testing';
import { RoutedAppDef } from '../../testing/routed-pages.app';
import { PAGE_CHANNEL } from '../page-channel.const';
import { PageRouteDef } from '../url/page-route-def';
import { PageUrls } from '../url/page-urls';
import { PageGraphProvider } from './page-graph-provider';
import type { PageAppSpec } from './page-graph-provider.types';
import { RouteCommonRule } from './route-common.rule';
import { RouteParamsRule } from './route-params.rule';
import { ScreenUrlRule } from './screen-url.rule';

// Правила PG-03…PG-07 повторяют проверки сборки `PageUrls` без броска и
// называют узел (D-UI-77): синтаксис шаблона пути, повтор на одном URL внутри
// приложения, параметры пути из экрана входа, общий путь экрана, выражение
// экранов набора в URL. Нарушение читается из отчёта `arch:check`, а не из
// вызова правила: код выхода и строка `PG-NN: …`. Таймеров нет.

const FORM = 'не по форме: [a-z0-9-]+ или :имя';
const KIND = 'нужна строка, целое или булево';

const route = (name: string, path: string, entry: string) =>
  PageRouteDef.define({
    name,
    label: `Маршрут ${name}`,
    description: `Описание маршрута ${name}.`,
    path,
    entry,
  });

const TASKS = route('tasks', '/', 'start');
const ASSIGNED = route('assigned', '/assigned', 'assigned');
const MENU = route('menu', '/menu', 'menu');

/** Вход приложения: тексты не проверяются. */
const entryOf = (address: Address) => ({
  label: 'Вход',
  description: 'Вход тестового приложения.',
  address,
});

/** Второе приложение того же набора: те же сторис, уведомления и входы, своё имя. */
const SecondPagesAppDef = UiAppDef.define({
  name: 'secondPages',
  label: 'Второе приложение на страницах',
  description: 'Второе приложение UI учебного набора для страничного канала.',
  set: ExampleUiSetDef,
  channel: PAGE_CHANNEL,
  stories: [PlanTasksStoryDef, FinishTasksStoryDef, FollowAssignedStoryDef],
  notifications: [TaskAssignedNotificationDef, TaskCompletedNotificationDef],
  entries: {
    start: entryOf(TaskListScreenDef.at({ page: 0 })),
    assigned: entryOf(AssignedTasksScreenDef.at({})),
  },
});

/** Приложение с двумя входами и сторис без уведомлений: представлений ему нужно три, а не пять. */
const LeanPagesAppDef = UiAppDef.define({
  name: 'leanPages',
  label: 'Узкое приложение на страницах',
  description: 'Приложение учебного набора только с двумя входами.',
  set: ExampleUiSetDef,
  channel: PAGE_CHANNEL,
  stories: [PlanTasksStoryDef, FinishTasksStoryDef, FollowAssignedStoryDef],
  entries: {
    start: entryOf(TaskListScreenDef.at({ page: 0 })),
    assigned: entryOf(AssignedTasksScreenDef.at({})),
  },
});

/** Сцена: набор, приложения страниц с их маршрутами и представлениями. */
type Scene = {
  readonly set: AnyUiSetDef;
  readonly apps: readonly PageAppSpec[];
};

const onExample = (
  app: AnyUiAppDef,
  routes: readonly PageRouteDef[],
): Scene => ({
  set: ExampleUiSetDef,
  apps: [{ app, views: examplePageViews, routes }],
});

const reportOf = (scene: Scene) =>
  ArchReport.of(
    UiScene.appOf(
      scene.set,
      scene.apps.map((spec) => spec.app),
      [new PageGraphProvider({ apps: scene.apps })],
    ),
  );

/** Приложение examplePages с маршрутами `TASKS`, `ASSIGNED`, `MENU` и `extra`. */
const examplePages = (...extra: readonly PageRouteDef[]) =>
  reportOf(onExample(ExamplePagesAppDef, [TASKS, ASSIGNED, MENU, ...extra]));

/** Приложение routedPages с маршрутами `routes`. */
const routedPages = (...routes: readonly PageRouteDef[]) =>
  reportOf(onExample(RoutedAppDef, routes));

/**
 * Набор `soloUi` с модулем `module`, экраном входа без параметров и экраном
 * `odd` с параметрами `params` и примерами `examples`; приложения страниц на
 * нём — `apps`. Реестр представлений — пустой по структуре: графу нужны
 * только `set` и `presented()`.
 */
const solo = (
  params: StrictSchema,
  module = 'solo',
  examples: readonly unknown[] = [],
  appNames: readonly string[] = ['soloPages'],
) => {
  const HomeScreenDef = ScreenDef.define({
    name: 'home',
    label: 'Главная',
    description: 'Экран входа без параметров.',
    reads: [ListTasksUcDef],
    data: v.object({}),
  });
  const OddScreenDef = ScreenDef.define({
    name: 'odd',
    label: 'Проба',
    description: 'Экран с параметрами под проверку.',
    params,
    reads: [ListTasksUcDef],
    data: v.object({}),
    examples: Object.fromEntries(
      examples.map((example, index) => [
        `case${index}`,
        {
          label: 'Пример',
          description: 'Пример пробы.',
          params: example,
          data: {},
        },
      ]),
    ),
  });
  const set = UiSetDef.define({
    name: 'soloUi',
    label: 'Проба',
    description: 'Набор с одним проверяемым экраном.',
    app: ExampleAppDef,
    modules: [
      UiModuleDef.define({
        name: module,
        label: 'Проба',
        description: 'Модуль пробы.',
        screens: [HomeScreenDef, OddScreenDef],
        stories: [],
      }),
    ],
  });
  const apps = appNames.map((name) =>
    UiAppDef.define({
      name,
      label: 'Проба',
      description: 'Приложение с одним проверяемым экраном.',
      set,
      channel: PAGE_CHANNEL,
      stories: [],
      entries: { start: entryOf(HomeScreenDef.at({})) },
    }),
  );
  const views = { set, presented: () => [] };
  const scene = (routes: readonly PageRouteDef[]): Scene => ({
    set,
    apps: apps.map((app) => ({ app, views, routes })),
  });
  return { set, scene, apps };
};

/** Отчёт приложения `soloPages` с маршрутом `/` на вход и маршрутами `extra`. */
const soloReport = (
  params: StrictSchema,
  module?: string,
  ...extra: readonly PageRouteDef[]
) =>
  reportOf(solo(params, module).scene([route('home', '/', 'start'), ...extra]));

const stringParams = v.strictObject({ q: v.optional(v.string()) });

describe('PG-03: шаблон пути маршрута — по синтаксису', () => {
  test('путь без / в начале — код 1 и строка PG-03; PG-04, PG-05, PG-06 молчат', () => {
    const report = examplePages(route('bad', 'bad', 'start'));

    expect(report.code).toBe(1);
    expect(report.rule('PG-03')).toEqual([
      'PG-03: маршрут examplePages/bad: шаблон пути «bad» не начинается с /',
    ]);
    expect(report.rule('PG-04')).toEqual([]);
    expect(report.rule('PG-05')).toEqual([]);
    expect(report.rule('PG-06')).toEqual([]);
  });

  test('регистр: сегмент /Bad не по форме', () => {
    const report = examplePages(route('bad', '/Bad', 'start'));

    expect(report.code).toBe(1);
    expect(report.rule('PG-03')).toEqual([
      `PG-03: маршрут examplePages/bad: сегмент «Bad» шаблона пути «/Bad» ${FORM}`,
    ]);
  });

  test('пустой сегмент: /a//b и /a/ — две строки в порядке id', () => {
    const report = examplePages(
      route('second', '/a/', 'start'),
      route('first', '/a//b', 'start'),
    );

    expect(report.code).toBe(1);
    expect(report.rule('PG-03')).toEqual([
      `PG-03: маршрут examplePages/first: сегмент «» шаблона пути «/a//b» ${FORM}`,
      `PG-03: маршрут examplePages/second: сегмент «» шаблона пути «/a/» ${FORM}`,
    ]);
  });

  test('имя параметра не по форме: /p/:1x', () => {
    const report = examplePages(route('bad', '/p/:1x', 'start'));

    expect(report.rule('PG-03')).toEqual([
      `PG-03: маршрут examplePages/bad: сегмент «:1x» шаблона пути «/p/:1x» ${FORM}`,
    ]);
  });

  test('повтор параметра: /p/:page/:page', () => {
    const report = examplePages(route('bad', '/p/:page/:page', 'start'));

    expect(report.rule('PG-03')).toEqual([
      'PG-03: маршрут examplePages/bad: параметр page повторён в шаблоне пути «/p/:page/:page»',
    ]);
  });

  test('чисто: /, /assigned, /task/:taskId — PG-03 молчит', () => {
    const report = routedPages(
      route('home', '/', 'start'),
      route('list', '/assigned', 'start'),
      route('task', '/task/:taskId', 'card'),
    );

    expect(report.rule('PG-03')).toEqual([]);
  });
});

describe('PG-04: маршруты приложения не совпадают на одном URL', () => {
  // Только два маршрута: общие `/` и `/assigned` пересеклись бы с `/:s`.
  const pair = (path1: string, path2: string) =>
    reportOf(
      onExample(ExamplePagesAppDef, [
        route('first', path1, 'start'),
        route('second', path2, 'start'),
      ]),
    );

  test('повтор пути — одна строка, порядок по id', () => {
    const report = examplePages(
      route('b', '/same', 'assigned'),
      route('a', '/same', 'start'),
    );

    expect(report.code).toBe(1);
    expect(report.rule('PG-04')).toEqual([
      'PG-04: приложение examplePages: маршруты examplePages/a и examplePages/b совпадают на одном URL: /same и /same',
    ]);
  });

  test.each([
    ['/p/:a', '/p/:b'],
    ['/:s', '/home'],
    ['/course/new', '/course/:slug'],
  ])(
    'шаблоны %s и %s совпадают по форме — по строке на пару',
    (first, second) => {
      const report = pair(first, second);

      expect(report.code).toBe(1);
      expect(report.rule('PG-04')).toEqual([
        `PG-04: приложение examplePages: маршруты examplePages/first и examplePages/second совпадают на одном URL: ${first} и ${second}`,
      ]);
    },
  );

  test('три совпавших шаблона — три строки: пары 1-2, 1-3, 2-3', () => {
    const report = examplePages(
      route('first', '/p/:a', 'start'),
      route('second', '/p/:b', 'start'),
      route('third', '/p/:c', 'start'),
    );

    expect(report.rule('PG-04')).toEqual([
      'PG-04: приложение examplePages: маршруты examplePages/first и examplePages/second совпадают на одном URL: /p/:a и /p/:b',
      'PG-04: приложение examplePages: маршруты examplePages/first и examplePages/third совпадают на одном URL: /p/:a и /p/:c',
      'PG-04: приложение examplePages: маршруты examplePages/second и examplePages/third совпадают на одном URL: /p/:b и /p/:c',
    ]);
  });

  test.each([
    ['/a', '/a/b', 'разная длина'],
    ['/a/x', '/a/y', 'разные неизменяемые сегменты'],
  ])('%s и %s не совпадают (%s) — PG-04 молчит', (first, second) => {
    expect(pair(first, second).rule('PG-04')).toEqual([]);
  });

  test('невалидный шаблон пропущен: /p/:a/ и /p/:a — PG-04 молчит, PG-03 называет первый', () => {
    const report = pair('/p/:a/', '/p/:a');

    expect(report.rule('PG-04')).toEqual([]);
    expect(report.rule('PG-03')).toHaveLength(1);
  });

  test('одинаковый /x в двух приложениях — PG-04 молчит: сверка по приложению', () => {
    const report = reportOf({
      set: ExampleUiSetDef,
      apps: [
        {
          app: ExamplePagesAppDef,
          views: examplePageViews,
          routes: [TASKS, ASSIGNED, route('same', '/x', 'start')],
        },
        {
          app: SecondPagesAppDef,
          views: examplePageViews,
          routes: [TASKS, ASSIGNED, route('same', '/x', 'start')],
        },
      ],
    });

    expect(report.rule('PG-04')).toEqual([]);
  });
});

describe('PG-05: параметры пути объявлены экраном входа', () => {
  test('/task/:id на входе card (taskId) — параметр id не из экрана', () => {
    const report = routedPages(
      route('home', '/', 'start'),
      route('task', '/task/:id', 'card'),
    );

    expect(report.code).toBe(1);
    expect(report.rule('PG-05')).toEqual([
      'PG-05: маршрут routedPages/task: параметр пути id не объявлен экраном входа exampleUi/todo/taskCard',
    ]);
  });

  test('чужой экран: /p/:taskId на входе start (taskList { page })', () => {
    const report = routedPages(route('person', '/p/:taskId', 'start'));

    expect(report.rule('PG-05')).toEqual([
      'PG-05: маршрут routedPages/person: параметр пути taskId не объявлен экраном входа exampleUi/todo/taskList',
    ]);
  });

  test('чисто: /page/:page на start и /task/:taskId на card', () => {
    const report = routedPages(
      route('home', '/', 'start'),
      route('paged', '/page/:page', 'start'),
      route('task', '/task/:taskId', 'card'),
    );

    expect(report.rule('PG-05')).toEqual([]);
  });

  test('вход nowhere: PG-01 называет вход, PG-05 молчит', () => {
    const report = routedPages(route('ghost', '/p/:x', 'nowhere'));

    expect(report.code).toBe(1);
    expect(report.rule('PG-01')).toEqual([
      'PG-01: маршрут routedPages/ghost: вход nowhere не объявлен приложением',
    ]);
    expect(report.rule('PG-05')).toEqual([]);
  });

  test('вход constructor (член прототипа): граф собирается без броска, PG-01 называет вход', () => {
    const report = routedPages(route('ghost', '/p/:x', 'constructor'));

    expect(report.code).toBe(1);
    expect(report.rule('PG-01')).toEqual([
      'PG-01: маршрут routedPages/ghost: вход constructor не объявлен приложением',
    ]);
    expect(report.rule('PG-05')).toEqual([]);
  });

  test('экран входа с замечанием PG-07 в PG-05 пропущен: его называет PG-07', () => {
    const { scene } = solo(v.strictObject({ x: v.array(v.string()) }));
    const report = reportOf(scene([route('home', '/', 'start')]));

    expect(report.rule('PG-05')).toEqual([]);
  });
});

describe('PG-05: несколько параметров пути', () => {
  test('два параметра пути не из экрана — две строки, по порядку в шаблоне', () => {
    const report = routedPages(route('many', '/a/:x/:y', 'start'));

    expect(report.rule('PG-05')).toEqual([
      'PG-05: маршрут routedPages/many: параметр пути x не объявлен экраном входа exampleUi/todo/taskList',
      'PG-05: маршрут routedPages/many: параметр пути y не объявлен экраном входа exampleUi/todo/taskList',
    ]);
  });
});

describe('Правила на графе, собранном вручную: узлы не из контракта ядра', () => {
  const node = (
    id: string,
    kind: string,
    props: Record<string, unknown> = {},
  ) => ({
    id,
    kind,
    label: id,
    description: id,
    visible: false,
    provider: 'test',
    props,
  });
  const graphOf = (
    nodes: ReturnType<typeof node>[],
    edges: { kind: string; from: string; to: string }[] = [],
  ) =>
    new Graph({
      providers: [],
      nodes,
      edges: edges.map((edge) => ({ ...edge, provider: 'test', props: {} })),
    });
  const routeNode = (path: string) =>
    node('app/go', 'pageRoute', { path, entry: 'start' });

  test('ребро opens к не-экрану: PG-05 молчит', () => {
    const graph = graphOf(
      [
        node('app', 'app'),
        routeNode('/p/:x'),
        node('u', 'group'),
        node('u/m', 'group'),
        node('u/m/s', 'screen', { params: {} }),
      ],
      [{ kind: 'opens', from: 'app/go', to: 'app' }],
    );

    expect(new RouteParamsRule().check(graph)).toEqual([]);
  });

  test('экран с параметром-массивом: PG-05 молчит, PG-07 называет экран', () => {
    const graph = graphOf(
      [
        node('app', 'app'),
        routeNode('/p/:x'),
        node('u', 'group'),
        node('u/m', 'group'),
        node('u/m/s', 'screen', {
          params: { properties: { x: { type: 'array' } } },
        }),
      ],
      [{ kind: 'opens', from: 'app/go', to: 'u/m/s' }],
    );

    expect(new RouteParamsRule().check(graph)).toEqual([]);
    expect(new ScreenUrlRule().check(graph)).toEqual([
      `параметр x экрана u/m/s не выражается в URL: ${KIND}`,
    ]);
  });

  test.each([
    ['один сегмент', 'solo'],
    ['четыре сегмента', 'a/b/c/d'],
  ])(
    'узел screen с id из %s пропускается: PG-06 и PG-07 молчат',
    (_name, id) => {
      const parts = id.split('/');
      const ancestors = parts
        .slice(0, -1)
        .map((_part, index) =>
          node(parts.slice(0, index + 1).join('/'), 'group'),
        );
      const graph = graphOf([
        ...ancestors,
        node(id, 'screen', {
          params: { type: 'object', properties: { x: { type: 'array' } } },
        }),
        node('app', 'app'),
        node('app/go', 'pageRoute', { path: '/c/d', entry: 'start' }),
      ]);

      expect(new RouteCommonRule().check(graph)).toEqual([]);
      expect(new ScreenUrlRule().check(graph)).toEqual([]);
    },
  );

  test('рядом с пропущенным узлом экран из трёх сегментов читается как обычно', () => {
    const graph = graphOf([
      node('a', 'group'),
      node('a/b', 'group'),
      node('a/b/c', 'group'),
      node('a/b/c/d', 'screen', {
        params: { properties: { x: { type: 'array' } } },
      }),
      node('u', 'group'),
      node('u/m', 'group'),
      node('u/m/s', 'screen', {
        params: { properties: { y: { type: 'array' } } },
      }),
    ]);

    expect(new ScreenUrlRule().check(graph)).toEqual([
      `параметр y экрана u/m/s не выражается в URL: ${KIND}`,
    ]);
  });
});

describe('PG-06: маршрут не пересекается с общим путём экрана', () => {
  test('/todo/odd совпадает с общим путём экрана odd модуля todo', () => {
    const report = soloReport(
      stringParams,
      'todo',
      route('clash', '/todo/odd', 'start'),
    );

    expect(report.code).toBe(1);
    expect(report.rule('PG-06')).toEqual([
      'PG-06: маршрут soloPages/clash: шаблон /todo/odd совпадает с общим путём экрана soloUi/todo/odd (/todo/odd)',
    ]);
  });

  test('/todo/:x на учебном наборе — строка на каждый из четырёх экранов модуля, порядок по id', () => {
    const report = examplePages(route('wide', '/todo/:x', 'start'));

    expect(report.code).toBe(1);
    expect(report.rule('PG-06')).toEqual([
      'PG-06: маршрут examplePages/wide: шаблон /todo/:x совпадает с общим путём экрана exampleUi/todo/assignedTasks (/todo/assignedTasks)',
      'PG-06: маршрут examplePages/wide: шаблон /todo/:x совпадает с общим путём экрана exampleUi/todo/mainMenu (/todo/mainMenu)',
      'PG-06: маршрут examplePages/wide: шаблон /todo/:x совпадает с общим путём экрана exampleUi/todo/taskCard (/todo/taskCard)',
      'PG-06: маршрут examplePages/wide: шаблон /todo/:x совпадает с общим путём экрана exampleUi/todo/taskList (/todo/taskList)',
    ]);
  });

  test('/:m/:s — тоже строка на каждый экран набора', () => {
    const report = examplePages(route('wide', '/:m/:s', 'start'));

    expect(report.rule('PG-06')).toEqual([
      'PG-06: маршрут examplePages/wide: шаблон /:m/:s совпадает с общим путём экрана exampleUi/todo/assignedTasks (/todo/assignedTasks)',
      'PG-06: маршрут examplePages/wide: шаблон /:m/:s совпадает с общим путём экрана exampleUi/todo/mainMenu (/todo/mainMenu)',
      'PG-06: маршрут examplePages/wide: шаблон /:m/:s совпадает с общим путём экрана exampleUi/todo/taskCard (/todo/taskCard)',
      'PG-06: маршрут examplePages/wide: шаблон /:m/:s совпадает с общим путём экрана exampleUi/todo/taskList (/todo/taskList)',
      'PG-06: маршрут examplePages/wide: шаблон /:m/:s совпадает с общим путём экрана exampleUi/users/userCard (/users/userCard)',
    ]);
  });

  test('маршрут /menu входа menu общего пути экрана mainMenu не пересекает — PG-06 молчит', () => {
    const report = examplePages();

    expect(report.code).toBe(0);
    expect(report.rule('PG-06')).toEqual([]);
  });

  test.each(['/todo', '/todo/odd/x', '/other/odd'])(
    '%s не совпадает с общим путём экрана — PG-06 молчит',
    (path) => {
      const report = soloReport(
        stringParams,
        'todo',
        route('near', path, 'start'),
      );

      expect(report.rule('PG-06')).toEqual([]);
    },
  );
});

describe('PG-06 и PG-07: экран с именем не по форме', () => {
  test('модуль my-module: PG-06 пропускает экран, PG-07 его называет', () => {
    const report = soloReport(
      stringParams,
      'my-module',
      route('clash', '/my-module/home', 'start'),
    );

    expect(report.rule('PG-06')).toEqual([]);
    expect(report.rule('PG-07')).toEqual([
      'PG-07: имя my-module не годится для общего пути экрана soloUi/my-module/home: буква, затем буквы и цифры',
      'PG-07: имя my-module не годится для общего пути экрана soloUi/my-module/odd: буква, затем буквы и цифры',
    ]);
  });

  test('имя модуля и параметры в одном экране: сначала имя, затем параметры', () => {
    const report = soloReport(
      v.strictObject({ x: v.array(v.string()) }),
      'my-module',
    );

    expect(report.rule('PG-07')).toEqual([
      'PG-07: имя my-module не годится для общего пути экрана soloUi/my-module/home: буква, затем буквы и цифры',
      'PG-07: имя my-module не годится для общего пути экрана soloUi/my-module/odd: буква, затем буквы и цифры',
      `PG-07: параметр x экрана soloUi/my-module/odd не выражается в URL: ${KIND}`,
    ]);
  });
});

describe('PG-07: экран набора выражается в URL', () => {
  const only = (report: ArchReport) => report.rule('PG-07');

  test.each([
    ['массив', v.strictObject({ x: v.array(v.string()) })],
    ['строка или null', v.strictObject({ x: v.nullable(v.string()) })],
    ['дробное число', v.strictObject({ x: v.number() })],
    ['константа', v.strictObject({ x: v.literal('x') })],
  ])('параметр вида «%s» — код 1 и строка с id экрана', (_name, params) => {
    const report = soloReport(params);

    expect(report.code).toBe(1);
    expect(only(report)).toEqual([
      `PG-07: параметр x экрана soloUi/solo/odd не выражается в URL: ${KIND}`,
    ]);
  });

  test('массив и nullable в одном экране — две строки в порядке полей', () => {
    const report = soloReport(
      v.strictObject({
        a: v.array(v.string()),
        b: v.nullable(v.string()),
      }),
    );

    expect(only(report)).toEqual([
      `PG-07: параметр a экрана soloUi/solo/odd не выражается в URL: ${KIND}`,
      `PG-07: параметр b экрана soloUi/solo/odd не выражается в URL: ${KIND}`,
    ]);
  });

  test('имя параметра _x', () => {
    const report = soloReport(v.strictObject({ _x: v.string() }));

    expect(only(report)).toEqual([
      'PG-07: имя параметра _x экрана soloUi/solo/odd не выражается в URL',
    ]);
  });

  test('имя модуля my-module — строка на каждый экран модуля, порядок по id', () => {
    const report = soloReport(stringParams, 'my-module');

    expect(report.code).toBe(1);
    expect(only(report)).toEqual([
      'PG-07: имя my-module не годится для общего пути экрана soloUi/my-module/home: буква, затем буквы и цифры',
      'PG-07: имя my-module не годится для общего пути экрана soloUi/my-module/odd: буква, затем буквы и цифры',
    ]);
  });

  test('чисто: учебный набор — целое page и uuid taskId', () => {
    expect(only(examplePages())).toEqual([]);
  });

  test('чисто: строка из вариантов, булево и необязательная строка', () => {
    const report = soloReport(
      v.strictObject({
        status: v.picklist(['open', 'done']),
        flag: F.boolean('Флаг пробы'),
        q: v.optional(v.string()),
      }),
    );

    expect(only(report)).toEqual([]);
  });

  test('одна строка на экран, а не на приложение: два приложения на одном наборе', () => {
    const { scene } = solo(
      v.strictObject({ x: v.array(v.string()) }),
      'solo',
      [],
      ['firstPages', 'secondPages'],
    );

    const report = reportOf(scene([route('home', '/', 'start')]));

    expect(only(report)).toEqual([
      `PG-07: параметр x экрана soloUi/solo/odd не выражается в URL: ${KIND}`,
    ]);
  });
});

describe('Круг «адрес → URL → адрес» на примерах — не правило графа', () => {
  const LENGTH = v.strictObject({
    q: v.pipe(
      v.string(),
      v.transform((text) => text.length),
    ),
  });

  test('transform в число и пример: сборка PageUrls бросает, а отчёт чист (остаток — долг ядра)', () => {
    const { set, apps, scene } = solo(LENGTH, 'solo', [{ q: 'abc' }]);
    const report = reportOf(scene([route('home', '/', 'start')]));

    for (const id of ['PG-01', 'PG-03', 'PG-04', 'PG-05', 'PG-06', 'PG-07']) {
      expect(report.rule(id)).toEqual([]);
    }
    const app = apps[0];
    expect(app).toBeDefined();
    expect(set.name).toBe('soloUi');
    expect(
      () =>
        new PageUrls({
          app: app as AnyUiAppDef,
          routes: [{ path: '/', entry: 'start' }],
        }),
    ).toThrow('soloUi/solo/odd');
  });
});

describe('Два приложения web в одном поставщике графа', () => {
  // Второе приложение — свои маршруты (другие имена и другие входы) и свой
  // набор представлений: поставщик не берёт чужие данные у первого.
  const SECOND_ROUTES = [
    route('home', '/', 'assigned'),
    route('list', '/list', 'start'),
  ];
  const SECOND_PRESENTED = [
    'exampleUi/todo/assignedTasks',
    'exampleUi/todo/taskCard',
    'exampleUi/todo/taskList',
  ];
  const scene: Scene = {
    set: ExampleUiSetDef,
    apps: [
      {
        app: ExamplePagesAppDef,
        views: examplePageViews,
        routes: [TASKS, ASSIGNED, MENU],
      },
      {
        app: LeanPagesAppDef,
        views: { set: ExampleUiSetDef, presented: () => SECOND_PRESENTED },
        routes: SECOND_ROUTES,
      },
    ],
  };
  const arch = () =>
    UiScene.appOf(
      scene.set,
      scene.apps.map((spec) => spec.app),
      [new PageGraphProvider({ apps: scene.apps })],
    );

  test('граф собирается: код 0, нарушений правил PG нет', () => {
    const report = ArchReport.of(arch());

    expect(report.code).toBe(0);
    for (const id of [
      'PG-01',
      'PG-02',
      'PG-03',
      'PG-04',
      'PG-05',
      'PG-06',
      'PG-07',
    ]) {
      expect(report.rule(id)).toEqual([]);
    }
  });
});

describe('Соответствие правил и сборки PageUrls', () => {
  /**
   * `PageUrls` бросает тогда и только тогда, когда в отчёте есть строка
   * PG-01 или PG-03…PG-07. PG-02 (вход без маршрута) в соответствие не входит:
   * сборка на него не бросает. Дрейф правила и сборки ловит эта таблица.
   */
  type Row = {
    readonly name: string;
    readonly scene: Scene;
    readonly app: AnyUiAppDef;
    readonly routes: readonly PageRouteDef[];
    readonly bad: boolean;
  };

  const exampleRow = (
    name: string,
    routes: readonly PageRouteDef[],
    bad: boolean,
    app: AnyUiAppDef = RoutedAppDef,
  ): Row => ({ name, scene: onExample(app, routes), app, routes, bad });

  const soloRow = (
    name: string,
    params: StrictSchema,
    module: string | undefined,
    bad: boolean,
  ): Row => {
    const built = solo(params, module);
    const routes = [route('home', '/', 'start')];
    const app = built.apps[0] as AnyUiAppDef;
    return { name, scene: built.scene(routes), app, routes, bad };
  };

  const rows: readonly Row[] = [
    exampleRow(
      'чисто: пути /, /page/:page, /task/:taskId',
      [
        route('home', '/', 'start'),
        route('paged', '/page/:page', 'start'),
        route('task', '/task/:taskId', 'card'),
      ],
      false,
    ),
    exampleRow(
      'PG-02 не в соответствии: вход assigned без маршрута',
      [TASKS],
      false,
      ExamplePagesAppDef,
    ),
    exampleRow('PG-01: вход nowhere', [route('ghost', '/g', 'nowhere')], true),
    exampleRow(
      'PG-01: вход constructor',
      [route('ghost', '/g', 'constructor')],
      true,
    ),
    exampleRow('PG-03: нет / в начале', [route('bad', 'bad', 'start')], true),
    exampleRow('PG-03: регистр', [route('bad', '/Bad', 'start')], true),
    exampleRow('PG-03: пустой сегмент', [route('bad', '/a//b', 'start')], true),
    exampleRow('PG-03: хвостовой /', [route('bad', '/a/', 'start')], true),
    exampleRow('PG-03: имя параметра', [route('bad', '/p/:1x', 'start')], true),
    exampleRow(
      'PG-03: повтор параметра',
      [route('bad', '/p/:page/:page', 'start')],
      true,
    ),
    exampleRow(
      'PG-04: тот же путь',
      [route('a', '/same', 'start'), route('b', '/same', 'card')],
      true,
    ),
    exampleRow(
      'PG-04: /c/new и /c/:page',
      [route('a', '/c/new', 'start'), route('b', '/c/:page', 'start')],
      true,
    ),
    exampleRow(
      'PG-04: разная длина — не совпадают',
      [route('a', '/a', 'start'), route('b', '/a/b', 'start')],
      false,
    ),
    exampleRow(
      'PG-04: разные неизменяемые — не совпадают',
      [route('a', '/a/x', 'start'), route('b', '/a/y', 'start')],
      false,
    ),
    exampleRow(
      'PG-05: параметр пути не из экрана',
      [route('task', '/task/:id', 'card')],
      true,
    ),
    exampleRow(
      'PG-05: параметр чужого экрана',
      [route('person', '/p/:taskId', 'start')],
      true,
    ),
    exampleRow(
      'PG-06: /todo/:page',
      [route('wide', '/todo/:page', 'start')],
      true,
    ),
    exampleRow('PG-06: /:m/:s', [route('wide', '/:m/:s', 'start')], true),
    exampleRow(
      'PG-06: /todo/x не совпадает',
      [route('near', '/todo/x', 'start')],
      false,
    ),
    soloRow(
      'PG-07: массив',
      v.strictObject({ x: v.array(v.string()) }),
      undefined,
      true,
    ),
    soloRow(
      'PG-07: nullable',
      v.strictObject({ x: v.nullable(v.string()) }),
      undefined,
      true,
    ),
    soloRow(
      'PG-07: дробное',
      v.strictObject({ x: v.number() }),
      undefined,
      true,
    ),
    soloRow(
      'PG-07: константа',
      v.strictObject({ x: v.literal('x') }),
      undefined,
      true,
    ),
    soloRow(
      'PG-07: имя _x',
      v.strictObject({ _x: v.string() }),
      undefined,
      true,
    ),
    soloRow('PG-07: имя модуля my-module', stringParams, 'my-module', true),
    soloRow(
      'чисто: строка, булево, вариант',
      v.strictObject({
        status: v.picklist(['open', 'done']),
        flag: F.boolean('Флаг пробы'),
        q: v.optional(v.string()),
      }),
      undefined,
      false,
    ),
  ];

  const lines = (report: ArchReport) =>
    ['PG-01', 'PG-03', 'PG-04', 'PG-05', 'PG-06', 'PG-07'].flatMap((id) =>
      report.rule(id),
    );

  const throws = (row: Row) => {
    try {
      new PageUrls({ app: row.app, routes: row.routes });
    } catch {
      return true;
    }
    return false;
  };

  test.each(rows)('$name', (row) => {
    expect(throws(row)).toBe(row.bad);
    expect(lines(reportOf(row.scene)).length > 0).toBe(row.bad);
  });
});
