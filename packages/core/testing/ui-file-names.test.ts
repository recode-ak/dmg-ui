import { describe, expect, it } from 'bun:test';
import { UiFileNames } from './ui-file-names';
import type {
  UiNamesLayout,
  UiNamesSource,
  UiNamesViolation,
} from './ui-file-names.types';

// Сценарии NM-01 (D-UI-112) на файлах в памяти: диска проверка не читает.
// Условная конфигурация магазина: набор UI, канал, приёмка и тесты набора.

const LAYOUT: UiNamesLayout = {
  sets: ['ui/shop/src'],
  channels: ['runners/web/src/ui'],
  others: ['acceptance/support'],
  tests: ['ui/shop/src'],
};

const SET = 'ui/shop/src';
const CHANNEL = 'runners/web/src/ui';

const file = (path: string, text: string): UiNamesSource => ({ path, text });

/** Объявление манифеста: `export const <Имя> = <База>.define({`. */
const define = (base: string, name: string) =>
  `export const ${name} = ${base}.define({\n  id: '${name}',\n});\n`;

/** Код вида: `export class <Имя> extends <База><Row> {}`. */
const code = (base: string, name: string) =>
  `export class ${name} extends ${base}<Row> {}\n`;

/** Помощник канала без базы объявления: вид — только по суффиксу. */
const exported = (name: string) => `export const ${name} = {};\n`;
const exportedClass = (name: string) => `export class ${name} {}\n`;

/** Минимум, при котором все четыре зоны конфигурации непусты и нет нарушений. */
const BASE: UiNamesSource[] = [
  file(`${SET}/shop-ui.set.ts`, define('UiSetDef', 'ShopUiSetDef')),
  file(
    `${SET}/cart/cart.ui-module.ts`,
    define('UiModuleDef', 'CartUiModuleDef'),
  ),
  file(`${CHANNEL}/shop.ui-app.ts`, define('UiAppDef', 'ShopUiAppDef')),
  file('acceptance/support/dialog-person.ts', 'export const person = 1;\n'),
];

/** `BASE` плюс файлы; файл с тем же путём заменяет файл базы. */
const plus = (...extra: UiNamesSource[]): UiNamesSource[] => {
  const byPath = new Map(BASE.map((f) => [f.path, f]));
  for (const f of extra) byPath.set(f.path, f);
  return [...byPath.values()];
};

const run = (files: readonly UiNamesSource[], layout: UiNamesLayout = LAYOUT) =>
  new UiFileNames(layout).check(files);

/** Папка модуля `lists` для сценариев теста рядом: имя папки не совпадает с темами тестов. */
const LISTS = `${SET}/lists`;
const listsModule = file(
  `${LISTS}/lists.ui-module.ts`,
  define('UiModuleDef', 'ListsUiModuleDef'),
);
const cartListScreen = (dir = LISTS) =>
  file(`${dir}/cart-list.screen.ts`, define('ScreenDef', 'CartListScreenDef'));
const cartListScode = file(
  `${LISTS}/cart-list.scode.ts`,
  code('ScreenCode', 'CartListScreenCode'),
);
const test = (path: string) => file(path, "import 'bun:test';\n");

const has = (
  found: readonly UiNamesViolation[],
  path: string,
  ...fragments: string[]
) => {
  const hit = found.find(
    (v) => v.file === path && fragments.every((f) => v.text.includes(f)),
  );
  if (!hit) {
    throw new Error(
      `нет нарушения для ${path} с фрагментами ${JSON.stringify(fragments)}; найдено: ${JSON.stringify(found)}`,
    );
  }
  return hit;
};

/** Проверка (слово после `NM-01 `) каждого нарушения файла. */
const kinds = (found: readonly UiNamesViolation[], path: string) =>
  found
    .filter((v) => v.file === path)
    .map((v) => v.text.slice(0, v.text.indexOf(':')));

describe('UiFileNames (NM-01) — зелёные раскладки', () => {
  it('Z1: зелёный минимум — по файлу каждого вида набора и канала', () => {
    const files = plus(
      file(
        `${SET}/cart/cart-list.screen.ts`,
        define('ScreenDef', 'CartListScreenDef'),
      ),
      file(
        `${SET}/cart/cart-list.scode.ts`,
        code('ScreenCode', 'CartListScreenCode'),
      ),
      test(`${SET}/cart/cart-list.scode.test.ts`),
      file(`${SET}/cart/buy.story.ts`, define('StoryDef', 'BuyStoryDef')),
      file(
        `${SET}/cart/bought.notification.ts`,
        define('NotificationDef', 'BoughtNotificationDef'),
      ),
      file(
        `${SET}/cart/bought.ncode.ts`,
        code('NotificationCode', 'BoughtNotificationCode'),
      ),
      file(`${SET}/cart/cart-rows.ts`, 'export const rows = [];\n'),
      file(`${CHANNEL}/cart-list.view.ts`, exportedClass('CartListView')),
    );

    expect(run(files)).toEqual([]);
  });

  it('Z2: остальные виды канала названы по суффиксу', () => {
    const files = plus(
      file(`${CHANNEL}/shop.views.ts`, exported('shopViews')),
      file(`${CHANNEL}/shop.routes.ts`, exported('shopRoutes')),
      file(`${CHANNEL}/shop.placements.ts`, exported('shopPlacements')),
      file(`${CHANNEL}/shop.wire.ts`, exported('shopWire')),
      file(`${CHANNEL}/shop.graph.ts`, exportedClass('ShopGraph')),
      file(`${CHANNEL}/shop.arch.ts`, exportedClass('ShopArch')),
    );

    expect(run(files)).toEqual([]);
  });
});

describe('UiFileNames (NM-01) — суффикс ↔ вид', () => {
  it('S1: Def экрана в файле «.view» — нарушение суффикса', () => {
    const path = `${SET}/cart/cart-list.view.ts`;
    const found = run(
      plus(file(path, define('ScreenDef', 'CartListScreenDef'))),
    );

    has(found, path, 'NM-01 суффикс', 'ScreenDef', '.view', '.screen');
  });

  it('S1: при неверном суффиксе имя не проверяется — одна проблема, одна строка', () => {
    const path = `${SET}/cart/cart-list.view.ts`;
    const found = run(plus(file(path, define('ScreenDef', 'CartListScreen'))));

    expect(kinds(found, path)).not.toContain('NM-01 имя');
  });

  it('S2: код экрана в «.code» — нужен «.scode»', () => {
    const path = `${SET}/cart/cart-list.code.ts`;
    const found = run(
      plus(file(path, code('ScreenCode', 'CartListScreenCode'))),
    );

    has(found, path, 'NM-01 суффикс', 'ScreenCode', '.code', '.scode');
  });

  it('S2: код уведомления в «.code» — нужен «.ncode»', () => {
    const path = `${SET}/cart/bought.code.ts`;
    const found = run(
      plus(file(path, code('NotificationCode', 'BoughtNotificationCode'))),
    );

    has(found, path, 'NM-01 суффикс', 'NotificationCode', '.code', '.ncode');
  });

  it('S3: суффикс «.screen» без объявления ScreenDef — нарушение', () => {
    const path = `${SET}/cart/cart-list.screen.ts`;
    const found = run(plus(file(path, 'export const rows = [];\n')));

    has(found, path, 'NM-01 суффикс', 'требует объявления CartListScreenDef');
  });

  it('S5: UiAppDef в файле «.app» — нужен «.ui-app»', () => {
    const path = `${CHANNEL}/shop.app.ts`;
    const found = run(plus(file(path, define('UiAppDef', 'ShopAppDef'))));

    has(found, path, 'NM-01 суффикс', 'UiAppDef', '.app', '.ui-app');
  });
});

describe('UiFileNames (NM-01) — объявление в тексте', () => {
  it('аннотация типа у const не прячет объявление', () => {
    const path = `${SET}/cart/cart-list.view.ts`;
    const found = run(
      plus(
        file(
          path,
          'export const CartListScreenDef: AnyScreenDef = ScreenDef.define({\n});\n',
        ),
      ),
    );

    has(found, path, 'NM-01 суффикс', 'ScreenDef', '.view', '.screen');
  });

  it("'**/*.ts' в строке не открывает комментарий: объявление после неё видно", () => {
    const path = `${SET}/cart/cart-list.screen.ts`;
    const text = `const glob = '**/*.ts';\n${define('ScreenDef', 'CartListScreen')}export const tail = '*/';\n`;
    const found = run(plus(file(path, text)));

    expect(kinds(found, path)).toEqual(['NM-01 имя']);
  });
});

describe('UiFileNames (NM-01) — один вид на файл', () => {
  it('S4: ScreenDef и NotificationDef в одном файле — нарушение вида файла', () => {
    const path = `${SET}/cart/mixed.screen.ts`;
    const found = run(
      plus(
        file(
          path,
          define('ScreenDef', 'MixedScreenDef') +
            define('NotificationDef', 'BoughtNotificationDef'),
        ),
      ),
    );

    has(found, path, 'NM-01 вид файла', 'ScreenDef', 'NotificationDef');
  });

  it('S6: два объявления ScreenDef в одном файле — нарушение вида файла', () => {
    const path = `${SET}/cart/cart-list.screen.ts`;
    const found = run(
      plus(
        file(
          path,
          define('ScreenDef', 'CartListScreenDef') +
            define('ScreenDef', 'CartRowScreenDef'),
        ),
      ),
    );

    has(found, path, 'NM-01 вид файла', 'объявлений ScreenDef: 2');
  });
});

describe('UiFileNames (NM-01) — имя объявления', () => {
  it('N1: Def без «Def» в конце — текст называет ожидаемое и фактическое имя', () => {
    const path = `${SET}/cart/cart-list.screen.ts`;
    const found = run(plus(file(path, define('ScreenDef', 'CartListScreen'))));

    expect(found).toEqual([
      {
        file: path,
        line: 1,
        text: 'NM-01 имя: ожидается CartListScreenDef (от «cart-list»), объявлено CartListScreen',
      },
    ]);
  });

  it('N2: имя набора — ShopUiSetDef от «shop-ui»', () => {
    const path = `${SET}/shop-ui.set.ts`;
    const found = run(plus(file(path, define('UiSetDef', 'ShopSetDef'))));

    has(found, path, 'NM-01 имя', 'ShopUiSetDef', 'ShopSetDef');
  });

  it('N3: класс кода экрана — <Имя>ScreenCode', () => {
    const path = 'acceptance/support/liar-assigned.scode.ts';
    const found = run(plus(file(path, code('ScreenCode', 'LiarAssignedCode'))));

    has(found, path, 'NM-01 имя', 'LiarAssignedScreenCode', 'LiarAssignedCode');
  });

  it('N4: имена канала — <Имя>View и <имя>Views', () => {
    const view = `${CHANNEL}/cart-list.view.ts`;
    const views = `${CHANNEL}/shop.views.ts`;
    const found = run(
      plus(
        file(view, exportedClass('CartView')),
        file(views, exported('ShopViews')),
      ),
    );

    has(found, view, 'NM-01 имя', 'CartListView', 'CartView');
    has(found, views, 'NM-01 имя', 'shopViews', 'ShopViews');
  });
});

describe('UiFileNames (NM-01) — место', () => {
  it('P1: экран в корне набора, не в папке UI-модуля', () => {
    const path = `${SET}/cart-list.screen.ts`;
    const found = run(plus(cartListScreen(SET)));

    expect(found).toHaveLength(1);
    has(found, path, 'NM-01 место', 'вне папки UI-модуля');
  });

  it('P2: экран глубже папки UI-модуля', () => {
    const path = `${SET}/cart/deep/cart-list.screen.ts`;
    const found = run(plus(cartListScreen(`${SET}/cart/deep`)));

    has(found, path, 'NM-01 место', 'вне папки UI-модуля');
  });

  it('P3: папка с экранами без своего <m>.ui-module.ts', () => {
    const found = run(
      plus(
        file(
          `${SET}/orders/order-list.screen.ts`,
          define('ScreenDef', 'OrderListScreenDef'),
        ),
      ),
    );

    expect(
      found.some(
        (v) =>
          v.text.startsWith('NM-01 место') &&
          v.text.includes('в папке «orders»') &&
          v.text.includes('нет orders.ui-module.ts'),
      ),
    ).toBe(true);
  });

  it('P4: «.set» не в корне набора — нарушение места', () => {
    const path = `${SET}/cart/shop-ui.set.ts`;
    const found = run(plus(file(path, define('UiSetDef', 'ShopUiSetDef'))));

    has(found, path, 'NM-01 место');
  });

  it('P4: чужой «.ui-module» в папке модуля — нарушение места', () => {
    const path = `${SET}/cart/orders.ui-module.ts`;
    const found = run(
      plus(file(path, define('UiModuleDef', 'OrdersUiModuleDef'))),
    );

    has(found, path, 'NM-01 место');
  });

  it('P5: «.view» в наборе — сторона канала', () => {
    const path = `${SET}/cart/cart-list.view.ts`;
    const found = run(plus(file(path, exportedClass('CartListView'))));

    has(found, path, 'NM-01 место', 'сторона');
  });

  it('P5: «.screen» в канале — сторона набора', () => {
    const path = `${CHANNEL}/cart-list.screen.ts`;
    const found = run(
      plus(file(path, define('ScreenDef', 'CartListScreenDef'))),
    );

    has(found, path, 'NM-01 место', 'сторона');
  });
});

describe('UiFileNames (NM-01) — тест рядом', () => {
  it('T1: тест кода без своего файла рядом', () => {
    const path = `${LISTS}/cart-list.scode.test.ts`;
    const found = run(plus(listsModule, test(path)));

    has(found, path, 'NM-01 тест', '«cart-list.scode.test.ts» без файла рядом');
  });

  it('T1: тест при своём файле рядом — зелёное', () => {
    const found = run(
      plus(
        listsModule,
        cartListScode,
        test(`${LISTS}/cart-list.scode.test.ts`),
      ),
    );

    expect(found).toEqual([]);
  });

  it('T2: однословная тема при соседях с общим префиксом — нарушение', () => {
    const path = `${LISTS}/cart-list.test.ts`;
    const found = run(
      plus(
        listsModule,
        cartListScreen(),
        file(`${LISTS}/cart-rows.ts`, 'export const rows = [];\n'),
        test(path),
      ),
    );

    has(found, path, 'NM-01 тест', '«cart-list.test.ts» без файла рядом');
  });

  it('T2: при cart-list.ts рядом — зелёное', () => {
    const found = run(
      plus(
        listsModule,
        file(`${LISTS}/cart-list.ts`, 'export const list = [];\n'),
        test(`${LISTS}/cart-list.test.ts`),
      ),
    );

    expect(found).toEqual([]);
  });

  it('T3: тема с головой <тема>.<вид>.ts — зелёное', () => {
    const found = run(
      plus(
        listsModule,
        cartListScreen(),
        test(`${LISTS}/cart-list-help.test.ts`),
      ),
    );

    expect(found).toEqual([]);
  });

  it('T3: <m>.ui-module.ts головой темы не служит — cart-list.test.ts в папке cart нарушение', () => {
    const path = `${SET}/cart/cart-list.test.ts`;
    const found = run(plus(test(path)));

    has(found, path, 'NM-01 тест', '«cart-list.test.ts» без файла рядом');
  });

  it('T3: при одном cart-list.types.ts головы нет — нарушение', () => {
    const path = `${LISTS}/cart-list-help.test.ts`;
    const found = run(
      plus(
        listsModule,
        file(`${LISTS}/cart-list.types.ts`, 'export type Row = number;\n'),
        test(path),
      ),
    );

    has(found, path, 'NM-01 тест', '«cart-list-help.test.ts» без файла рядом');
  });

  it('T4: грань при <файл>.ts — зелёное', () => {
    const found = run(
      plus(
        listsModule,
        cartListScode,
        test(`${LISTS}/cart-list.scode.refresh.test.ts`),
      ),
    );

    expect(found).toEqual([]);
  });

  it('T4: грань без <файл>.ts — нарушение', () => {
    const path = `${LISTS}/cart-list.scode.refresh.test.ts`;
    const found = run(plus(listsModule, test(path)));

    has(found, path, 'NM-01 тест', 'без файла рядом');
  });

  it('T5: readme.test.ts допустим без файла рядом', () => {
    const found = run(plus(listsModule, test(`${LISTS}/readme.test.ts`)));

    expect(found).toEqual([]);
  });

  it('T5: «.browser.test.ts» проверке теста рядом не подлежит', () => {
    const found = run(plus(listsModule, test(`${LISTS}/page.browser.test.ts`)));

    expect(found).toEqual([]);
  });

  it('T5: <x>.story.test.ts при своём <x>.story.ts — зелёное', () => {
    const found = run(
      plus(
        listsModule,
        file(`${LISTS}/buy.story.ts`, define('StoryDef', 'BuyStoryDef')),
        test(`${LISTS}/buy.story.test.ts`),
      ),
    );

    expect(found).toEqual([]);
  });

  it('тест рядом проверяется в sets без поля tests', () => {
    const path = 's/m/orphan.scode.test.ts';
    const found = run(
      [
        file('s/m/m.ui-module.ts', define('UiModuleDef', 'MUiModuleDef')),
        test(path),
      ],
      { sets: ['s'] },
    );

    has(found, path, 'NM-01 тест', '«orphan.scode.test.ts» без файла рядом');
  });

  describe('сквозные тесты в каталоге testing', () => {
    const layout: UiNamesLayout = { ...LAYOUT, tests: ['pkg/testing'] };

    it('T5: <x>.story.test.ts без <x>.story.ts — нарушение даже в testing', () => {
      const path = 'pkg/testing/telegram-back.story.test.ts';
      const found = run(plus(test(path)), layout);

      has(found, path, 'NM-01 тест', '«telegram-back.story.test.ts»');
    });

    it('T5: telegram-story.test.ts прямо в testing — зелёное', () => {
      const found = run(
        plus(test('pkg/testing/telegram-story.test.ts')),
        layout,
      );

      expect(found).toEqual([]);
    });

    it('T6: сквозной тест прямо в корне testing — зелёное', () => {
      const found = run(plus(test('pkg/testing/whatever.test.ts')), layout);

      expect(found).toEqual([]);
    });

    it('T6: сквозной тест в подкаталоге testing — нарушение', () => {
      const path = 'pkg/testing/limits/whatever.test.ts';
      const found = run(plus(test(path)), layout);

      has(found, path, 'NM-01 тест', '«whatever.test.ts» без файла рядом');
    });

    it('T6: сквозной тест прямо в acceptance — зелёное', () => {
      const found = run(plus(test('acceptance/whatever.test.ts')), {
        ...LAYOUT,
        tests: ['acceptance'],
      });

      expect(found).toEqual([]);
    });
  });
});

describe('UiFileNames (NM-01) — зоны и границы проверки', () => {
  it('Q1: зона без файлов — нарушение, а не молчаливый зелёный', () => {
    const found = run([], { sets: ['ui/none/src'] });

    expect(found).toHaveLength(1);
    has(found, 'ui/none/src', 'NM-01 зона', 'в «ui/none/src» нет файлов');
  });

  it('Q2: файл вне зон игнорируется', () => {
    const found = run(
      plus(file('lib/anything.code.ts', code('ScreenCode', 'Anything'))),
    );

    expect(found).toEqual([]);
  });

  it('Q3: объявление в комментарии объявлением не считается', () => {
    const text = [
      '/** Не `ScreenDef.define(` тут. */',
      '// ScreenDef.define(',
      exportedClass('CartListView'),
    ].join('\n');
    const found = run(plus(file(`${CHANNEL}/cart-list.view.ts`, text)));

    expect(found).toEqual([]);
  });

  for (const suffix of ['fixture', 'test-kit']) {
    it(`Q4: «*.${suffix}.ts» из проверок вида и имени исключён`, () => {
      const path = `${SET}/cart/x.${suffix}.ts`;
      const found = run(plus(file(path, define('ScreenDef', 'Whatever'))));

      expect(found).toEqual([]);
    });
  }

  it('Q5: суффикс вне словаря без объявления вида не флагируется', () => {
    const found = run(
      plus(file(`${CHANNEL}/shop-bot.community.ts`, exported('shopBot'))),
    );

    expect(found).toEqual([]);
  });

  it('Q6: строка нарушения — строка объявления после комментария в 6 строк', () => {
    const comment = '/**\n * a\n * b\n * c\n * d\n */\n';
    const path = `${SET}/cart/cart-list.screen.ts`;
    const found = run(
      plus(file(path, comment + define('ScreenDef', 'CartListScreen'))),
    );

    expect(found.map((v) => v.line)).toEqual([7]);
    has(found, path, 'NM-01 имя');
  });
});
