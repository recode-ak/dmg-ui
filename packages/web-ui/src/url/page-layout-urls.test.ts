import { describe, expect, test } from 'bun:test';
import { err, type Result } from 'dmg-core';
import { Address } from 'dmg-ui';
import {
  AssignedTasksScreenDef,
  TASK_A,
  TaskCardScreenDef,
  TaskListScreenDef,
} from 'dmg-ui/testing';
import { RoutedAppDef } from '../../testing/routed-pages.app';
import { PageLayoutUrls } from './page-layout-urls';
import { type PageRoute, type PageUrlRejection, PageUrls } from './page-urls';

// Состав областей страницы в одной ссылке: основной адрес — как у `PageUrls`,
// остальные области — вложенными URL под резервными ключами `_<область>`.
// Ключи — закрытый список `linked`: чужие метки вроде `_ga` пропускаются.
// Разбор — внешние данные: отказ вложенного URL — `Result` у области, а не у
// всей ссылки; бросок — только на сборке с неверным списком ключей.

const LIMIT = 2048;
const ROUTED: readonly PageRoute[] = [
  { path: '/', entry: 'start' },
  { path: '/page/:page', entry: 'start' },
  { path: '/task/:taskId', entry: 'card' },
];

const urls = () => new PageUrls({ app: RoutedAppDef, routes: ROUTED });
const layout = (linked: readonly string[]) =>
  new PageLayoutUrls(urls(), linked);

const list = (page: number) => TaskListScreenDef.at({ page });
const card = (taskId: string) => new Address(TaskCardScreenDef, { taskId });

/** Вложенный URL карточки задачи A, закодированный целиком. */
const CARD_A = `/task/${TASK_A}`;
const SIDE_A = `_side=${encodeURIComponent(CARD_A)}`;

/** Разбор, который обязан пройти: значение или падение теста с причиной. */
const parsed = (linked: readonly string[], url: string) => {
  const result = layout(linked).parse(url);
  if (!result.ok) throw new Error(`${url}: отказ ${result.error}`);
  return result.value;
};

/** Адрес совпал с ожидаемым: тот же экран и те же параметры. */
const expectAddress = (actual: Address, expected: Address) => {
  expect(actual.screen).toBe(expected.screen);
  expect(actual.params).toEqual(expected.params);
};

/** Область прочитана и совпала с ожидаемым адресом. */
const expectRegion = (
  actual: Result<Address, PageUrlRejection> | undefined,
  expected: Address,
) => {
  if (actual?.ok !== true)
    throw new Error(`область не прочитана: ${JSON.stringify(actual)}`);
  expectAddress(actual.value, expected);
};

describe.each([
  [
    [] as string[],
    `/?page=2`,
    {} as Record<string, Address>,
    'ничего не пишется',
  ],
  [['side'], `/?page=2&${SIDE_A}`, { side: card(TASK_A) }, 'только панель'],
  [
    ['side', 'modal'],
    `/?page=2&${SIDE_A}&_modal=%2F`,
    { side: card(TASK_A), modal: list(0) },
    'панель и окно',
  ],
])(
  'PageLayoutUrls — круг «области → URL → области», linked %j',
  (linked, url, back, name) => {
    test(`список page=2, карточка, список page=0: ${name}`, () => {
      const regions = { side: card(TASK_A), modal: list(0) };

      expect(layout(linked).url(list(2), regions)).toBe(url);

      const result = parsed(linked, url);
      expectAddress(result.main, list(2));
      expect(Object.keys(result.regions).sort()).toEqual(
        Object.keys(back).sort(),
      );
      for (const [name, address] of Object.entries(back)) {
        expectRegion(result.regions[name], address);
      }
    });

    test('только main: URL равен urls.url(main), регионов нет', () => {
      expect(layout(linked).url(list(2), {})).toBe(urls().url(list(2)));
      expect(layout(linked).url(list(2), { side: undefined })).toBe('/?page=2');

      const result = parsed(linked, '/?page=2');
      expectAddress(result.main, list(2));
      expect(result.regions).toEqual({});
    });
  },
);

describe('PageLayoutUrls.url — сборка', () => {
  test('main без параметров в запросе: первый ключ — через ?, а не &', () => {
    expect(layout(['side']).url(list(0), { side: card(TASK_A) })).toBe(
      `/?${SIDE_A}`,
    );
  });

  test('область, которой нет в linked, не пишется', () => {
    const regions = { side: card(TASK_A), modal: list(0) };

    expect(layout(['side']).url(list(0), regions)).toBe(`/?${SIDE_A}`);
    expect(layout([]).url(list(0), regions)).toBe('/');
  });

  test('порядок ключей — порядок linked, а не порядок областей в объекте', () => {
    const regions = { modal: list(0), side: card(TASK_A) };

    expect(layout(['modal', 'side']).url(list(0), regions)).toBe(
      `/?_modal=%2F&${SIDE_A}`,
    );
  });

  test('область без адреса пропущена, остальные пишутся', () => {
    expect(
      layout(['side', 'modal']).url(list(0), {
        side: undefined,
        modal: AssignedTasksScreenDef.at({}),
      }),
    ).toBe(`/?_modal=${encodeURIComponent('/todo/assignedTasks')}`);
  });

  test('main не собрался (адрес длиннее предела) — url undefined, области не спасают', () => {
    const tooLong = card('x'.repeat(LIMIT - '/task/'.length + 1));

    expect(
      layout(['side']).url(tooLong, { side: card(TASK_A) }),
    ).toBeUndefined();
  });

  test('область не собралась — пропущена, ссылка на main остаётся', () => {
    const tooLong = card('x'.repeat(LIMIT - '/task/'.length + 1));

    expect(layout(['side']).url(list(2), { side: tooLong })).toBe('/?page=2');
  });
});

describe('PageLayoutUrls.url — предел 2048 на всю строку', () => {
  /** Основной адрес длиной `main` знаков taskId и панель длиной `side`. */
  const long = (main: number, side: number) =>
    layout(['side', 'modal']).url(card('x'.repeat(main)), {
      side: card('x'.repeat(side)),
      modal: list(0),
    });

  test('каждая по отдельности влезает, вместе — нет: панель пропущена, окно записано', () => {
    const url = long(1200, 1000);

    expect(url).toBe(`/task/${'x'.repeat(1200)}?_modal=%2F`);
    expect(url?.length).toBeLessThanOrEqual(LIMIT);
  });

  test('ровно в предел — область записана (окну места нет), на знак длиннее — пропущена, окно записано', () => {
    const fits = long(1000, 1025);
    const over = long(1000, 1026);

    expect(fits).toContain('_side=');
    expect(fits).toHaveLength(LIMIT);
    expect(fits).not.toContain('_modal=');
    expect(over).not.toContain('_side=');
    expect(over).toContain('_modal=');
    expect(over?.length).toBeLessThanOrEqual(LIMIT);
  });

  test('ссылка ровно в предел — длина 2048', () => {
    const url = layout(['side']).url(card('x'.repeat(1000)), {
      side: card('x'.repeat(1025)),
    });

    expect(url).toHaveLength(LIMIT);
  });
});

describe('PageLayoutUrls.parse — ключи и вложенные адреса', () => {
  test('linked [side]: _modal во входящей ссылке пропущен', () => {
    const result = parsed(['side'], `/?${SIDE_A}&_modal=%2F`);

    expectRegion(result.regions.side, card(TASK_A));
    expect('modal' in result.regions).toBe(false);
  });

  test('linked []: /?_side=… читается как main, областей нет (совместимость со ссылками без состава)', () => {
    const result = parsed([], `/?${SIDE_A}`);

    expectAddress(result.main, list(0));
    expect(result.regions).toEqual({});
  });

  test('чужая метка _ga пропущена, панель прочитана', () => {
    const result = parsed(['side'], `/?_ga=GA1.2&${SIDE_A}`);

    expectAddress(result.main, list(0));
    expectRegion(result.regions.side, card(TASK_A));
    expect('_ga' in result.regions).toBe(false);
  });

  test('ключ с кодированием читается как резервный: %5Fside — один слой, значение декодируется один раз', () => {
    const result = parsed(['side'], `/?%5F${SIDE_A.slice(1)}`);

    expectRegion(result.regions.side, card(TASK_A));
  });

  test('двойное кодирование значения — вложенный URL без ведущего /: malformed', () => {
    const result = parsed(
      ['side'],
      `/?_side=${encodeURIComponent(encodeURIComponent(CARD_A))}`,
    );

    expect(result.regions.side).toEqual(err('malformed'));
  });

  test.each([
    ['пустое значение', '_side=', 'malformed'],
    [
      'не ASCII во вложенном',
      `_side=${encodeURIComponent('/нет/такого')}`,
      'malformed',
    ],
    ['нет ведущего /', `_side=${encodeURIComponent('task/x')}`, 'malformed'],
    [
      'неизвестный путь',
      `_side=${encodeURIComponent('/todo/nope')}`,
      'unknownPath',
    ],
    [
      'значение параметра не по схеме',
      `_side=${encodeURIComponent('/task/not-a-uuid')}`,
      'invalidParams',
    ],
  ] as const)(
    'вложенный URL неразборчив — %s: main прочитан, область — отказ %s',
    (_name, query, reason) => {
      const result = parsed(['side'], `/?page=3&${query}`);

      expectAddress(result.main, list(3));
      expect(result.regions.side).toEqual(err(reason));
    },
  );

  test('вложенный URL с резервным ключом — malformed: вложенность одна, без рекурсии', () => {
    const nested = `_side=${encodeURIComponent('/?_modal=%2F')}`;

    const result = parsed(['side', 'modal'], `/?${nested}`);

    expect(result.regions.side).toEqual(err('malformed'));
    expect('modal' in result.regions).toBe(false);
  });

  test('резервный ключ вложенного, которого нет в linked, и чужая метка вложенного не мешают', () => {
    const withModal = parsed(
      ['side'],
      `/?_side=${encodeURIComponent('/?_modal=%2F')}`,
    );
    const withLabel = parsed(
      ['side', 'modal'],
      `/?_side=${encodeURIComponent('/?_ga=1')}`,
    );

    expectRegion(withModal.regions.side, list(0));
    expectRegion(withLabel.regions.side, list(0));
  });

  test('ключ дважды — вся ссылка malformed (правило адреса в URL)', () => {
    expect(layout(['side']).parse('/?_side=a&_side=b')).toEqual(
      err('malformed'),
    );
  });

  test('ключ дважды через кодирование — вся ссылка malformed', () => {
    expect(layout(['side']).parse(`/?${SIDE_A}&%5Fside=%2F`)).toEqual(
      err('malformed'),
    );
  });

  test('кривое % во внешнем слое — вся ссылка malformed', () => {
    expect(layout(['side']).parse('/?_side=%ZZ')).toEqual(err('malformed'));
  });

  test('main неразборчив — отказ ссылки с причиной main, области не читаются', () => {
    expect(layout(['side']).parse(`/todo/nope?${SIDE_A}`)).toEqual(
      err('unknownPath'),
    );
  });

  test('ссылка длиннее предела — tooLong, вложенное не разбирается', () => {
    expect(layout(['side']).parse(`/?${'x'.repeat(LIMIT)}`)).toEqual(
      err('tooLong'),
    );
  });
});

describe('PageLayoutUrls — сборка', () => {
  test.each([
    ['имя не по форме: с _', ['_side']],
    ['имя не по форме: с цифры', ['1x']],
    ['имя не по форме: дефис', ['a-b']],
    ['пустое имя', ['']],
    ['повтор имени', ['side', 'side']],
  ])('%s — бросок сборки', (_name, linked) => {
    expect(() => layout(linked)).toThrow();
  });

  test('имена по форме без повторов собираются', () => {
    expect(() => layout(['side', 'modal', 'Panel2'])).not.toThrow();
  });
});

describe('PageLayoutUrls.parse — мусор не бросает', () => {
  const garbage = [
    '',
    '\u0000',
    '%',
    '?',
    '??&',
    '//x',
    '/?',
    '/?_side',
    '/?_side=&_modal=',
    '/?_side=%',
    '/?_side=%ED%A0%80',
    '/?_side=%ED%A0%80%ED%B0%80',
    `/?_side=${encodeURIComponent('/?_side=/?_side=')}`,
    'x'.repeat(5000),
    `/?_side=${'%25'.repeat(1500)}`,
  ];

  test.each(garbage.map((url) => [url.slice(0, 30), url]))(
    'вход %j — только Result',
    (_name, url) => {
      for (const linked of [[], ['side'], ['side', 'modal']]) {
        const result = layout(linked).parse(url);

        expect(typeof result.ok).toBe('boolean');
      }
    },
  );
});
