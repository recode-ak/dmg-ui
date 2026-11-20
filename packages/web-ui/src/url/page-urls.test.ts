import { describe, expect, test } from 'bun:test';
import { F } from 'dmg-core';
import { ExampleAppDef, ListTasksUcDef } from 'dmg-core/testing/example';
import {
  Address,
  type AnyScreenDef,
  type AnyUiAppDef,
  ScreenDef,
  type StrictSchema,
  UiAppDef,
  UiModuleDef,
  UiSetDef,
} from 'dmg-ui';
import {
  AssignedTasksScreenDef,
  TASK_A,
  TASK_B,
  TaskCardScreenDef,
  TaskListScreenDef,
} from 'dmg-ui/testing';
import * as v from 'valibot';
import { ExamplePagesUiAppDef, examplePagesRoutes } from '../../testing';
import { RoutedPagesUiAppDef } from '../../testing/routed-pages.ui-app';
import { PAGE_CHANNEL } from '../page-channel.const';
import { type PageRoute, type PageUrlRejection, PageUrls } from './page-urls';

// Кодек адреса страничного канала: адрес `main` ↔ путь и строка запроса
// страницы. Пример — приложение страниц учебного набора (`/`, `/assigned`);
// маршруты с параметрами пути, невыразимые схемы и вход с двумя параметрами —
// тестовые приложения этого файла. Разбор — внешние данные: отказ — `Result`
// с причиной, без броска; сборка своего — строка или `undefined`, бросок —
// только ошибка программиста. Кодек синхронный, таймеров нет.

const LIMIT = 2048;
const CARD_PREFIX = '/todo/taskCard?taskId=';

/** Кодек приложения страниц учебного примера с его маршрутами. */
const exampleUrls = () =>
  new PageUrls({ app: ExamplePagesUiAppDef, routes: examplePagesRoutes });

/** Разбор, который обязан пройти: адрес или падение теста с причиной отказа. */
const parsed = (urls: PageUrls, url: string): Address => {
  const result = urls.parse(url);
  if (!result.ok) throw new Error(`${url}: отказ ${result.error}`);
  return result.value;
};

/** Текст входа приложения: тексты не проверяются. */
const entry = (address: Address) => ({
  label: 'Вход',
  description: 'Вход тестового приложения.',
  address,
});

const ROUTED: readonly PageRoute[] = [
  { path: '/', entry: 'start' },
  { path: '/page/:page', entry: 'start' },
  { path: '/task/:taskId', entry: 'card' },
];

const routedUrls = () =>
  new PageUrls({ app: RoutedPagesUiAppDef, routes: ROUTED });

/** Сборка кодека на приложении с маршрутами `routes`. */
const build = (
  routes: readonly PageRoute[],
  app: AnyUiAppDef = RoutedPagesUiAppDef,
) => new PageUrls({ app, routes });

describe('PageUrls — круг адрес → URL → адрес на учебном примере', () => {
  const rows: [string, Address, string][] = [
    ['список, страница 0 — голый путь', TaskListScreenDef.at({ page: 0 }), '/'],
    ['список, страница 1', TaskListScreenDef.at({ page: 1 }), '/?page=1'],
    ['список, страница 12', TaskListScreenDef.at({ page: 12 }), '/?page=12'],
    ['назначенные', AssignedTasksScreenDef.at({}), '/assigned'],
    [
      'карточка задачи A — общий путь экрана',
      TaskCardScreenDef.at({ taskId: TASK_A }),
      `${CARD_PREFIX}5e3d1c2b-7a6f-4e8d-b9c0-a1f2e3d4c5b6`,
    ],
    [
      'карточка задачи B — общий путь экрана',
      TaskCardScreenDef.at({ taskId: TASK_B }),
      `${CARD_PREFIX}9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d`,
    ],
  ];

  test.each(rows)('%s', (_name, address, url) => {
    const urls = exampleUrls();

    expect(urls.url(address)).toBe(url);
    const back = parsed(urls, url);
    expect(back.screen).toBe(address.screen);
    expect(back.params).toEqual(address.params);
  });
});

describe('PageUrls — каждый пример каждого экрана набора выражается URL', () => {
  const screens = ExamplePagesUiAppDef.set.modules.flatMap((m) => m.screens);
  const examples = screens.flatMap((def) =>
    Object.entries(def.examples ?? {}).map(
      ([name, example]) =>
        [`${def.name}.${name}`, def, example.params] as const,
    ),
  );

  test('экранов в наборе ровно пять, у каждого есть пример: проверка не вхолостую', () => {
    expect(screens.map((def) => def.name).sort()).toEqual([
      'assignedTasks',
      'mainMenu',
      'taskCard',
      'taskList',
      'userCard',
    ]);
    for (const def of screens) {
      expect(Object.keys(def.examples ?? {}).length).toBeGreaterThan(0);
    }
  });

  test.each(examples)(
    'пример %s: URL с одного /, без JSON; разбор — тот же адрес',
    (_name, def, params) => {
      const urls = exampleUrls();
      const address = new Address(def, params);

      const url = urls.url(address);

      expect(url).toBeDefined();
      expect(url?.startsWith('/')).toBe(true);
      expect(url?.startsWith('//')).toBe(false);
      expect(url).not.toMatch(/[{}[\]"]|%7B|%7D|%5B|%5D|%22/i);
      const back = parsed(urls, url ?? '');
      expect(back.screen).toBe(def);
      expect(back.params).toEqual(address.params);
    },
  );
});

describe('PageUrls.parse — адрес входа и общий путь экрана', () => {
  const rows: [string, string, AnyScreenDef, object][] = [
    ['/', 'список, страница 0', TaskListScreenDef, { page: 0 }],
    ['/?page=0', 'список, страница 0', TaskListScreenDef, { page: 0 }],
    [
      '/todo/taskList?page=3',
      'список, страница 3',
      TaskListScreenDef,
      { page: 3 },
    ],
    ['/todo/assignedTasks', 'назначенные', AssignedTasksScreenDef, {}],
    ['/assigned?', 'назначенные', AssignedTasksScreenDef, {}],
    ['/%61ssigned', 'назначенные', AssignedTasksScreenDef, {}],
  ];

  test.each(rows)('%s — %s', (url, _name, screen, params) => {
    const address = parsed(exampleUrls(), url);

    expect(address.screen).toBe(screen);
    expect(address.params).toStrictEqual(params);
  });

  test('общий путь экрана с маршрутом разбирается, а сборка даёт маршрут', () => {
    const urls = exampleUrls();

    const address = parsed(urls, '/todo/taskList?page=3');

    expect(urls.url(address)).toBe('/?page=3');
  });
});

describe('PageUrls — маршрут с параметрами пути', () => {
  test('карточка по маршруту /task/:taskId: сборка и разбор сходятся', () => {
    const urls = routedUrls();
    const address = TaskCardScreenDef.at({ taskId: TASK_B });

    const url = urls.url(address);

    expect(url).toBe(`/task/${TASK_B}`);
    const back = parsed(urls, url ?? '');
    expect(back.screen).toBe(TaskCardScreenDef);
    expect(back.params).toStrictEqual({ taskId: TASK_B });
  });

  test('/page/5 — список, страница 5; сборка того же адреса — первый объявленный маршрут экрана', () => {
    const urls = routedUrls();

    const address = parsed(urls, '/page/5');

    expect(address.screen).toBe(TaskListScreenDef);
    expect(address.params).toStrictEqual({ page: 5 });
    expect(urls.url(TaskListScreenDef.at({ page: 5 }))).toBe('/?page=5');
  });

  test.each([
    ['карточка A', TaskCardScreenDef.at({ taskId: TASK_A })],
    ['карточка B', TaskCardScreenDef.at({ taskId: TASK_B })],
    ['список, страница 5', TaskListScreenDef.at({ page: 5 })],
    ['список, страница 0', TaskListScreenDef.at({ page: 0 })],
  ])(
    '%s: свой URL с одного /, не с //; разбор — тот же адрес',
    (_name, address) => {
      const urls = routedUrls();

      const url = urls.url(address) ?? '';

      expect(url.startsWith('/')).toBe(true);
      expect(url.startsWith('//')).toBe(false);
      const back = parsed(urls, url);
      expect(back.screen).toBe(address.screen);
      expect(back.params).toStrictEqual(address.params);
    },
  );

  test.each([
    ['.', `${CARD_PREFIX}.`],
    ['..', `${CARD_PREFIX}..`],
  ])(
    'значение %p параметра пути маршрут не выражает — общий путь экрана',
    (taskId, url) => {
      expect(routedUrls().url(new Address(TaskCardScreenDef, { taskId }))).toBe(
        url,
      );
    },
  );

  test('URL по маршруту ровно в предел — строка, на знак длиннее — undefined (общий путь длиннее)', () => {
    const urls = routedUrls();
    const fits = 'x'.repeat(LIMIT - '/task/'.length);

    expect(urls.url(new Address(TaskCardScreenDef, { taskId: fits }))).toBe(
      `/task/${fits}`,
    );
    expect(
      urls.url(new Address(TaskCardScreenDef, { taskId: `${fits}x` })),
    ).toBeUndefined();
  });

  describe('URL по маршруту длиннее предела — следующий маршрут, затем общий путь', () => {
    const LONG = '/task-card-reached-through-a-long-fixed-prefix/:taskId';
    const taskId = 'x'.repeat(LIMIT - CARD_PREFIX.length);

    test('маршрут не влезает, общий путь влезает — общий путь', () => {
      const urls = build([
        { path: '/', entry: 'start' },
        { path: LONG, entry: 'card' },
      ]);

      expect(urls.url(new Address(TaskCardScreenDef, { taskId }))).toBe(
        `${CARD_PREFIX}${taskId}`,
      );
    });

    test('первый маршрут не влезает, второй влезает — второй', () => {
      const urls = build([
        { path: '/', entry: 'start' },
        { path: LONG, entry: 'card' },
        { path: '/t/:taskId', entry: 'card' },
      ]);

      expect(urls.url(new Address(TaskCardScreenDef, { taskId }))).toBe(
        `/t/${taskId}`,
      );
    });
  });

  test.each([
    ['/page/x', 'invalidParams'],
    ['/page/5?page=6', 'malformed'],
    ['/page/x?page=6', 'malformed'],
    ['/task/%2e%2e', 'malformed'],
    ['/task/a%2Fb', 'invalidParams'],
  ] as const)('%s — отказ %s', (url, reason) => {
    expect(routedUrls().parse(url)).toEqual({ ok: false, error: reason });
  });

  test('знак / значения параметра пути кодируется', () => {
    expect(
      routedUrls().url(new Address(TaskCardScreenDef, { taskId: 'a/b' })),
    ).toBe('/task/a%2Fb');
  });

  test('пустое значение параметра пути маршрут не выражает — общий путь экрана', () => {
    expect(
      routedUrls().url(new Address(TaskCardScreenDef, { taskId: '' })),
    ).toBe(CARD_PREFIX);
  });
});

describe('PageUrls — вход с двумя параметрами: значения входа не подмешиваются', () => {
  const PairScreenDef = ScreenDef.define({
    name: 'pair',
    label: 'Пара',
    description: 'Обязательный и необязательный параметры.',
    params: v.strictObject({
      a: v.pipe(v.number(), v.integer()),
      b: v.optional(v.pipe(v.number(), v.integer())),
    }),
    reads: [ListTasksUcDef],
    data: v.object({}),
  });
  const PairAppDef = UiAppDef.define({
    name: 'pairPages',
    label: 'Пара',
    description: 'Вход с обоими значениями.',
    set: UiSetDef.define({
      name: 'pairUi',
      label: 'Пара',
      description: 'Один экран с двумя параметрами.',
      app: ExampleAppDef,
      modules: [
        UiModuleDef.define({
          name: 'desk',
          label: 'Стол',
          description: 'Экран пары.',
          screens: [PairScreenDef],
          stories: [],
        }),
      ],
    }),
    channel: PAGE_CHANNEL,
    stories: [],
    entries: { start: entry(PairScreenDef.at({ a: 1, b: 2 })) },
  });
  const pairUrls = () => build([{ path: '/r', entry: 'start' }], PairAppDef);

  test('голый путь маршрута — ровно адрес входа', () => {
    const address = parsed(pairUrls(), '/r');

    expect(address.screen).toBe(PairScreenDef);
    expect(address.params).toStrictEqual({ a: 1, b: 2 });
  });

  test('/r?a=5 — только значения из URL: необязательный b пуст', () => {
    const address = parsed(pairUrls(), '/r?a=5');

    expect(address.params).toStrictEqual({ a: 5 });
  });

  test('/r?b=3 — обязательный a из входа не берётся: отказ invalidParams', () => {
    expect(pairUrls().parse('/r?b=3')).toEqual({
      ok: false,
      error: 'invalidParams',
    });
  });

  test.each([
    ['/r?a=5', { a: 5 }],
    ['/r?a=1', { a: 1 }],
    ['/r?a=5&b=2', { a: 5, b: 2 }],
  ])('%s — круг сходится', (url, params) => {
    const urls = pairUrls();

    expect(urls.url(PairScreenDef.at(params))).toBe(url);
    expect(parsed(urls, url).params).toStrictEqual(params);
  });

  test('адрес входа — голый путь', () => {
    expect(pairUrls().url(PairScreenDef.at({ a: 1, b: 2 }))).toBe('/r');
  });

  test('адрес без единого значения при непустом входе маршрутом не выражается — общий путь экрана', () => {
    expect(pairUrls().url(new Address(PairScreenDef, {} as never))).toBe(
      '/desk/pair',
    );
  });
});

describe('PageUrls.parse — неразборчивый URL: отказ с причиной, без броска', () => {
  const refuses = (url: string, reason: PageUrlRejection) => {
    const urls = exampleUrls();

    expect(() => urls.parse(url)).not.toThrow();
    expect(urls.parse(url)).toEqual({ ok: false, error: reason });
  };

  test('длиннее предела (2049 знаков) — tooLong', () => {
    const url = `/${'a'.repeat(LIMIT)}`;

    expect(url).toHaveLength(LIMIT + 1);
    refuses(url, 'tooLong');
  });

  test('ровно предел (2048 знаков) — разбирается дальше: unknownPath, не tooLong', () => {
    const url = `/${'a'.repeat(LIMIT - 1)}`;

    expect(url).toHaveLength(LIMIT);
    refuses(url, 'unknownPath');
  });

  const rows: [string, PageUrlRejection][] = [
    ['', 'malformed'],
    ['assigned', 'malformed'],
    ['http://h/assigned', 'malformed'],
    ['//assigned', 'malformed'],
    ['/assigned/', 'malformed'],
    ['/todo//taskList', 'malformed'],
    ['/assigned#x', 'malformed'],
    ['/нет', 'malformed'],
    ['/a b', 'malformed'],
    ['/todo/..', 'malformed'],
    ['/todo/.', 'malformed'],
    ['/todo/%2e%2e', 'malformed'],
    ['/todo/%zz', 'malformed'],
    ['/todo/%', 'malformed'],
    ['/todo/%C0%AF', 'malformed'],
    ['/todo/%00', 'malformed'],
    ['/todo/%7F', 'malformed'],
    ['/todo/%C2%85', 'malformed'],
    ['/?page=%zz', 'malformed'],
    ['/?%zz=1', 'malformed'],
    ['/?page=1&page=2', 'malformed'],
    ['/?utm_source=1&utm_source=2', 'malformed'],
    ['/?page', 'malformed'],
    ['/assigned?x', 'malformed'],
    ['/?=1', 'malformed'],
    ['/?page=1&&x=2', 'malformed'],
    ['/?page=1&', 'malformed'],
    ['/?page=%00', 'malformed'],
    [`${CARD_PREFIX}%ED%A0%80`, 'malformed'],
    ['/Assigned', 'unknownPath'],
    ['/assigned/x', 'unknownPath'],
    ['/todo/taskList/extra', 'unknownPath'],
    ['/todo/taskCrd', 'unknownPath'],
    ['/other/taskList', 'unknownPath'],
    ['/exampleUi/todo/taskList', 'unknownPath'],
    ['/Todo/taskList', 'unknownPath'],
    ['/__proto__/x', 'unknownPath'],
    ['/todo/__proto__', 'unknownPath'],
    ['/todo/constructor', 'unknownPath'],
    ['/todo/toString', 'unknownPath'],
    ['/todo%2FtaskList', 'unknownPath'],
    ['/?page=-1', 'invalidParams'],
    ['/?page=01', 'invalidParams'],
    ['/?page=-0', 'invalidParams'],
    ['/?page=1.0', 'invalidParams'],
    ['/?page=1e3', 'invalidParams'],
    ['/?page=0x10', 'invalidParams'],
    ['/?page=%201', 'invalidParams'],
    ['/?page=', 'invalidParams'],
    ['/?page=9007199254740992', 'invalidParams'],
    ['/?page=11111111111111111', 'invalidParams'],
    ['/?page=%7B%7D', 'invalidParams'],
    ['/?page=true', 'invalidParams'],
    ['/todo/taskCard', 'invalidParams'],
    [`${CARD_PREFIX}%D0%BD%D0%B5%D1%82`, 'invalidParams'],
  ];

  test.each(rows)('%p — %s', (url, reason) => {
    refuses(url, reason);
  });
});

describe('PageUrls.parse — ключи, которых экран не объявил, пропускаются', () => {
  test.each([
    ['/?page=2&utm_source=x', { page: 2 }],
    ['/?utm_source=x&fbclid=y', { page: 0 }],
    ['/?_side=x', { page: 0 }],
  ])('%s — список, страница по объявленному ключу или входа', (url, params) => {
    const address = parsed(exampleUrls(), url);

    expect(address.screen).toBe(TaskListScreenDef);
    expect(address.params).toStrictEqual(params);
  });

  test('__proto__ и constructor в запросе не становятся ключами и не трогают прототип', () => {
    const address = parsed(exampleUrls(), '/?__proto__=x&constructor=y&page=1');
    const params = address.params as Record<string, unknown>;

    expect(params).toStrictEqual({ page: 1 });
    expect(Object.getPrototypeOf(params)).toBe(Object.prototype);
    expect(Object.keys(params)).toEqual(['page']);
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });

  test('регистр ключа значим: taskid — чужой ключ, карточка по taskId', () => {
    const address = parsed(exampleUrls(), `${CARD_PREFIX}${TASK_A}&taskid=x`);

    expect(address.screen).toBe(TaskCardScreenDef);
    expect(address.params).toStrictEqual({ taskId: TASK_A });
  });
});

describe('PageUrls.url — свой адрес', () => {
  test('экран вне набора — бросок', () => {
    const Stray = ScreenDef.define({
      name: 'stray',
      label: 'Чужой',
      description: 'Экран вне набора.',
      reads: [ListTasksUcDef],
      data: v.object({}),
    });

    expect(() => exampleUrls().url(Stray.at({}))).toThrow();
  });

  test('значение не того вида — бросок', () => {
    expect(() =>
      exampleUrls().url(new Address(TaskListScreenDef, { page: '1' } as never)),
    ).toThrow();
  });

  test.each([
    ['дробное целое', { page: 1.5 }],
    ['целое за пределом безопасных', { page: 2 ** 53 }],
  ])('%s — бросок', (_name, params) => {
    expect(() =>
      exampleUrls().url(new Address(TaskListScreenDef, params as never)),
    ).toThrow();
  });

  test('число в строковом параметре — бросок', () => {
    expect(() =>
      exampleUrls().url(new Address(TaskCardScreenDef, { taskId: 5 } as never)),
    ).toThrow();
  });

  test.each([
    ['\u0000', 'NUL'],
    ['a\nb', 'перевод строки'],
    ['\u007F', 'DEL'],
    ['a\u0085', 'C1'],
  ])(
    'управляющий знак в значении (%p, %s) — undefined: разбор его отверг бы',
    (taskId) => {
      expect(
        exampleUrls().url(new Address(TaskCardScreenDef, { taskId })),
      ).toBeUndefined();
    },
  );

  test('одиночный суррогат в значении — undefined, без броска', () => {
    expect(
      exampleUrls().url(new Address(TaskCardScreenDef, { taskId: '\uD800' })),
    ).toBeUndefined();
  });

  test('URL ровно в предел — строка, на знак длиннее — undefined', () => {
    const urls = exampleUrls();
    const fits = 'x'.repeat(LIMIT - CARD_PREFIX.length);

    const url = urls.url(new Address(TaskCardScreenDef, { taskId: fits }));

    expect(url).toHaveLength(LIMIT);
    expect(
      urls.url(new Address(TaskCardScreenDef, { taskId: `${fits}x` })),
    ).toBeUndefined();
  });
});

describe('PageUrls — сборка: маршруты', () => {
  test('маршрут на необъявленный вход — бросок с именем входа', () => {
    expect(() => build([{ path: '/x', entry: 'nowhere' }])).toThrow(
      'маршрут /x ведёт на вход nowhere, которого нет у приложения routedPages',
    );
  });

  test('два маршрута с одним путём — бросок', () => {
    expect(() =>
      build([
        { path: '/same', entry: 'start' },
        { path: '/same', entry: 'card' },
      ]),
    ).toThrow('два маршрута с путём /same');
  });

  test('шаблоны одной формы с разными именами параметров — бросок; по отдельности собираются', () => {
    const page = { path: '/p/:page', entry: 'start' };
    const card = { path: '/p/:taskId', entry: 'card' };

    expect(() => build([page])).not.toThrow();
    expect(() => build([card])).not.toThrow();
    expect(() => build([page, card])).toThrow();
  });

  test('маршрут на вход с именем члена прототипа (constructor) — тот же бросок, что на необъявленный', () => {
    expect(() => build([{ path: '/x', entry: 'constructor' }])).toThrow(
      'маршрут /x ведёт на вход constructor, которого нет у приложения routedPages',
    );
  });

  test.each([
    ['/:page', '/assigned'],
    ['/assigned', '/:page'],
    ['/s/:page', '/s/new'],
    ['/s/new', '/s/:page'],
  ])(
    'шаблоны %s и %s совпадают на одном URL — бросок с обоими шаблонами',
    (first, second) => {
      const routes = [
        { path: first, entry: 'start' },
        { path: second, entry: 'start' },
      ];

      expect(() => build([routes[0] as PageRoute])).not.toThrow();
      expect(() => build([routes[1] as PageRoute])).not.toThrow();
      expect(() => build(routes)).toThrow(
        `маршруты ${first} и ${second} совпадают на одном URL`,
      );
    },
  );

  test('шаблоны /a/:page и /b/:taskId на одном URL не совпадают — собираются', () => {
    expect(() =>
      build([
        { path: '/a/:page', entry: 'start' },
        { path: '/b/:taskId', entry: 'card' },
      ]),
    ).not.toThrow();
  });

  test.each(['tasks', '/tasks/', '//', '/Tasks', '/ta sks', '/:', '/:1x', ''])(
    'шаблон %p — бросок с путём в ёлочках',
    (path) => {
      expect(() => build([{ path, entry: 'start' }])).toThrow(`«${path}»`);
    },
  );

  test('параметр шаблона с именем не по форме (/:1x) — бросок о форме сегмента', () => {
    expect(() => build([{ path: '/:1x', entry: 'start' }])).toThrow(
      'не по форме',
    );
  });

  test('параметр шаблона не из экрана входа — бросок', () => {
    expect(() => build([{ path: '/p/:taskId', entry: 'start' }])).toThrow(
      'taskId',
    );
  });

  test('повтор параметра в шаблоне — бросок', () => {
    expect(() => build([{ path: '/p/:page/:page', entry: 'start' }])).toThrow();
  });

  test('шаблон совпадает с общим путём экрана набора — бросок', () => {
    expect(() => build([{ path: '/todo/:page', entry: 'start' }])).toThrow(
      '/todo/:page',
    );
  });

  test('учебный пример и приложение с параметрами пути собираются', () => {
    expect(() => exampleUrls()).not.toThrow();
    expect(() => routedUrls()).not.toThrow();
  });
});

describe('PageUrls — сборка: параметры экранов набора выражаются URL', () => {
  const HomeScreenDef = ScreenDef.define({
    name: 'home',
    label: 'Главная',
    description: 'Экран входа без параметров.',
    reads: [ListTasksUcDef],
    data: v.object({}),
  });

  /**
   * Приложение страниц: экран входа без параметров и экран `odd` с
   * параметрами `params` в модуле `module` и примерами с параметрами
   * `examples`. Экран `odd` ни один маршрут и вход не открывают — требование
   * лежит на весь набор.
   */
  const solo = (
    params: StrictSchema,
    module = 'solo',
    examples: readonly unknown[] = [],
  ) => {
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
    const app = UiAppDef.define({
      name: 'soloPages',
      label: 'Проба',
      description: 'Приложение с одним проверяемым экраном.',
      set: UiSetDef.define({
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
      }),
      channel: PAGE_CHANNEL,
      stories: [],
      entries: { start: entry(HomeScreenDef.at({})) },
    });
    return { screen: OddScreenDef, app };
  };

  const soloUrls = (params: StrictSchema, module?: string) =>
    build([{ path: '/', entry: 'start' }], solo(params, module).app);

  test.each([
    ['массив', v.strictObject({ x: v.array(v.string()) })],
    ['строка или null', v.strictObject({ x: v.nullable(v.string()) })],
    ['дробное число', v.strictObject({ x: v.number() })],
    ['константа', v.strictObject({ x: v.literal('x') })],
    ['дата', v.strictObject({ x: v.date() })],
  ])('параметр вида «%s» — бросок с id экрана', (_name, params) => {
    expect(() => soloUrls(params)).toThrow('soloUi/solo/odd');
  });

  test('имя параметра с _ — бросок с именем', () => {
    expect(() => soloUrls(v.strictObject({ _x: v.string() }))).toThrow('_x');
  });

  test('имя модуля не по шаблону — бросок с именем', () => {
    expect(() =>
      soloUrls(v.strictObject({ q: v.optional(v.string()) }), 'my-module'),
    ).toThrow('my-module');
  });

  describe('страж на примерах экрана: круг примера сходится', () => {
    const LENGTH = v.strictObject({
      q: v.pipe(
        v.string(),
        v.transform((text) => text.length),
      ),
    });
    const BANG = v.strictObject({
      q: v.pipe(
        v.string(),
        v.transform((text) => `${text}!`),
      ),
    });
    const urls = (params: StrictSchema, examples: readonly unknown[]) =>
      build(
        [{ path: '/', entry: 'start' }],
        solo(params, 'solo', examples).app,
      );

    test('transform в число и пример — бросок с id экрана: URL такого адреса не собрать', () => {
      expect(() => urls(LENGTH, [{ q: 'abc' }])).toThrow('soloUi/solo/odd');
    });

    test('transform, который разбор применяет второй раз, и пример — бросок с id экрана', () => {
      expect(() => urls(BANG, [{ q: 'a' }])).toThrow('soloUi/solo/odd');
    });

    test('без примеров страж экран не проверяет — сборка проходит', () => {
      expect(() => urls(LENGTH, [])).not.toThrow();
    });

    test('пример, URL которого не собирается (управляющий знак), пропускается', () => {
      expect(() =>
        urls(v.strictObject({ q: v.string() }), [{ q: '\u0000' }, { q: 'a' }]),
      ).not.toThrow();
    });

    test('пример не по схеме пропускается: его ловит правило графа UI-20', () => {
      expect(() =>
        urls(v.strictObject({ q: v.string() }), [{ q: 5 }]),
      ).not.toThrow();
    });
  });

  describe('строка из вариантов, булево и необязательная строка', () => {
    const PARAMS = v.strictObject({
      status: v.picklist(['open', 'done']),
      flag: F.boolean('Флаг пробы'),
      q: v.optional(v.string()),
    });
    const { screen, app } = solo(PARAMS);
    const urls = () => build([{ path: '/', entry: 'start' }], app);

    test.each([
      ['/solo/odd?status=open&flag=true', { status: 'open', flag: true }],
      [
        '/solo/odd?status=done&flag=false&q=%D0%B0%20%D0%B1',
        { status: 'done', flag: false, q: 'а б' },
      ],
    ])('%s — круг сходится, пробел — %%20', (url, params) => {
      const codec = urls();

      expect(codec.url(new Address(screen, params))).toBe(url);
      const back = parsed(codec, url);
      expect(back.screen).toBe(screen);
      expect(back.params).toStrictEqual(params);
    });

    test.each([
      ['/solo/odd?status=open&flag=true&q=a+b', 'a+b'],
      ['/solo/odd?status=open&flag=true&q=%252F', '%2F'],
      ['/solo/odd?status=open&flag=true&q=', ''],
    ])(
      '%s — строка %p: + не пробел, декодирование одно, пустое — пустая строка',
      (url, q) => {
        expect(parsed(urls(), url).params).toStrictEqual({
          status: 'open',
          flag: true,
          q,
        });
      },
    );

    test.each([
      '/solo/odd?status=open&flag=1',
      '/solo/odd?status=open&flag=',
      '/solo/odd?status=open&flag=True',
      '/solo/odd?status=other&flag=true',
    ])('%s — отказ invalidParams', (url) => {
      expect(urls().parse(url)).toEqual({ ok: false, error: 'invalidParams' });
    });

    test('строка в булевом параметре своего адреса — бросок', () => {
      expect(() =>
        urls().url(
          new Address(screen, { status: 'open', flag: 'true' } as never),
        ),
      ).toThrow();
    });
  });
});

describe('PageUrls.pairs — пары строки запроса одним разбором', () => {
  const pairs = (url: string) => routedUrls().pairs(url);

  test('ключ и значение декодируются один раз: %5Fside — _side, %2F — /', () => {
    expect(pairs('/?%5Fside=%2Ftask%2Fa')).toEqual(
      new Map([['_side', '/task/a']]),
    );
  });

  test('значение с двойным кодированием остаётся после одного слоя закодированным', () => {
    expect(pairs('/?_side=%252Ftask')).toEqual(new Map([['_side', '%2Ftask']]));
  });

  test('+ — знак +, не пробел', () => {
    expect(pairs('/?a=b+c')).toEqual(new Map([['a', 'b+c']]));
  });

  test('пары — по порядку строки запроса; ключи, которых нет у экрана, возвращаются', () => {
    const result = pairs('/?page=2&_ga=GA1.2&_side=%2F');

    expect([...(result ?? [])]).toEqual([
      ['page', '2'],
      ['_ga', 'GA1.2'],
      ['_side', '/'],
    ]);
  });

  test.each([
    ['без строки запроса', '/'],
    ['пустая строка запроса', '/?'],
    ['путь маршрута без запроса', `/task/${TASK_A}`],
  ])('%s — пустая карта', (_name, url) => {
    expect(pairs(url)).toEqual(new Map());
  });

  test('строка ровно в предел — карта, на знак длиннее — undefined', () => {
    const fits = `/?a=${'x'.repeat(LIMIT - '/?a='.length)}`;

    expect(fits).toHaveLength(LIMIT);
    expect(pairs(fits)?.get('a')).toHaveLength(LIMIT - '/?a='.length);
    expect(pairs(`${fits}x`)).toBeUndefined();
  });

  test.each([
    ['не ASCII', '/?a=ж'],
    ['решётка', '/?a=1#x'],
    ['нет ведущего /', 'a=1'],
    ['запрос без пути', '?a=1'],
    ['пустая пара в конце', '/?a=1&'],
    ['пустая пара в начале', '/?&a=1'],
    ['пара без =', '/?a'],
    ['пустой ключ', '/?=1'],
    ['повтор ключа', '/?a=1&a=2'],
    ['повтор ключа через кодирование', '/?_side=1&%5Fside=2'],
    ['кривое кодирование %', '/?a=%ZZ'],
    ['обрыв кодирования %', '/?a=%'],
    ['управляющий знак NUL', '/?a=%00'],
    ['управляющий знак в ключе', '/?%0A=1'],
    ['невалидный UTF-8', '/?a=%ED%A0%80'],
  ])('отказ формы: %s — undefined, без броска', (_name, url) => {
    expect(pairs(url)).toBeUndefined();
  });

  test('отказ на тех же входах, что у parse: форма не пропускается ни там, ни здесь', () => {
    for (const url of ['/?a=1&a=2', '/?a=%ZZ', '/?a=1#x', 'a=1', '/?a=ж']) {
      expect(pairs(url)).toBeUndefined();
      expect(routedUrls().parse(url).ok).toBe(false);
    }
  });
});
