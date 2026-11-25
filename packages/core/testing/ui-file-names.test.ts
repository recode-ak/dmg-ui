import { describe, expect, it } from 'bun:test';
import { UiFileNames } from './ui-file-names';
import type {
  UiNamesLayout,
  UiNamesSource,
  UiNamesViolation,
} from './ui-file-names.types';

// Сценарии NM-01 (D-UI-112, D-UI-119) на файлах в памяти: диска проверка не читает.
// Условный проект магазина формы `single` с корнем `src/`: описание, код и два канала
// модуля, kit, оболочка, приёмка. Модуль `shop`: сторис `buy` и `browse`, экран `cart`
// общий для обеих (в `shared/`), экран `pay` — только `buy`.

const UI = 'src/platform/ui';
const LOGIC = 'src/frontend/{m}/logic';
const CHAT = 'src/frontend/{m}/chat';
const WEB = 'src/frontend/{m}/web';
const KIT = 'src/frontend/chat-kit';
const SHELL = 'src/runners';

const LAYOUT: UiNamesLayout = {
  ui: UI,
  logic: LOGIC,
  channels: [CHAT, WEB],
  kits: [KIT],
  shells: [SHELL],
  others: ['acceptance/support'],
  tests: ['src', 'acceptance'],
};

/** Каталог зоны для модуля: `{m}` шаблона → имя модуля. */
const of = (template: string, m = 'shop') => template.replace('{m}', m);

const SHOP = `${UI}/shop`;
const L = of(LOGIC);
const C = of(CHAT);
const W = of(WEB);

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

/** Сторис `<name>` с относительными импортами экранов: по ним выводится место экрана. */
const story = (name: string, ...from: string[]) =>
  from.map((spec, i) => `import { Def${i} } from '${spec}';\n`).join('') +
  define('StoryDef', name);

const buyStory = (...from: string[]) =>
  file(
    `${SHOP}/buy/buy.story.ts`,
    story('BuyStoryDef', './pay.screen', '../shared/cart.screen', ...from),
  );
const browseStory = (...from: string[]) =>
  file(
    `${SHOP}/browse/browse.story.ts`,
    story('BrowseStoryDef', '../shared/cart.screen', ...from),
  );

/** Минимум, при котором все зоны конфигурации непусты и нет нарушений. */
const BASE: UiNamesSource[] = [
  file(`${UI}/shop-ui.set.ts`, define('UiSetDef', 'ShopUiSetDef')),
  file(`${SHOP}/shop.ui-module.ts`, define('UiModuleDef', 'ShopUiModuleDef')),
  buyStory(),
  file(`${SHOP}/buy/pay.screen.ts`, define('ScreenDef', 'PayScreenDef')),
  browseStory(),
  file(`${SHOP}/shared/cart.screen.ts`, define('ScreenDef', 'CartScreenDef')),
  file(`${L}/shop-codes.ts`, 'export const shopCodes = [];\n'),
  file(`${L}/buy/pay.scode.ts`, code('ScreenCode', 'PayScreenCode')),
  file(`${C}/shop-chat.views.ts`, exported('shopChatViews')),
  file(`${C}/buy/pay.view.ts`, exportedClass('PayView')),
  file(`${W}/shop-web.views.ts`, exported('shopWebViews')),
  file(`${KIT}/chat-theme.ts`, 'export const theme = {};\n'),
  file(`${SHELL}/shop.ui-app.ts`, define('UiAppDef', 'ShopUiAppDef')),
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

/** Папка `shared/` кода модуля для сценариев теста рядом: помощники без пары. */
const LS = `${L}/shared`;
const cartScode = file(
  `${LS}/cart.scode.ts`,
  code('ScreenCode', 'CartScreenCode'),
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
  it('Z1 (#2): зелёный минимум — экран двух сторис в shared/, пары кода и видов по пути, тест манифеста модуля в корне модуля', () => {
    const files = plus(
      file(
        `${SHOP}/shared/bought.notification.ts`,
        define('NotificationDef', 'BoughtNotificationDef'),
      ),
      file(`${SHOP}/shared/cart-rows.ts`, 'export const rows = [];\n'),
      test(`${SHOP}/shop.ui-module.test.ts`),
      file(`${L}/shared/cart.scode.ts`, code('ScreenCode', 'CartScreenCode')),
      test(`${L}/shared/cart.scode.test.ts`),
      file(
        `${L}/shared/bought.ncode.ts`,
        code('NotificationCode', 'BoughtNotificationCode'),
      ),
      file(`${L}/shared/cart-note.ts`, 'export const note = 1;\n'),
      file(`${L}/index.ts`, "export { shopCodes } from './shop-codes';\n"),
      file(`${C}/shared/cart.view.ts`, exportedClass('CartView')),
      file(`${C}/shared/bought.view.ts`, exportedClass('BoughtView')),
      file(`${C}/shared/cart-lines.ts`, 'export const lines = [];\n'),
      file(
        `${C}/index.ts`,
        "export { shopChatViews } from './shop-chat.views';\n",
      ),
      file(`${W}/buy/pay.view.ts`, exportedClass('PayView')),
      file(`${UI}/index.ts`, "export * from './shop-ui.set';\n"),
      file(`${UI}/shop-subject.ts`, 'export const subject = 1;\n'),
    );

    expect(run(files)).toEqual([]);
  });

  it('#3: уведомление в shared/ одной сторис и в папке чужой сторис — место уведомления не проверяется', () => {
    const files = plus(
      buyStory('../shared/bought.notification'),
      browseStory('../buy/paid.notification'),
      file(
        `${SHOP}/shared/bought.notification.ts`,
        define('NotificationDef', 'BoughtNotificationDef'),
      ),
      file(
        `${SHOP}/buy/paid.notification.ts`,
        define('NotificationDef', 'PaidNotificationDef'),
      ),
    );

    expect(run(files)).toEqual([]);
  });

  it('#4: экран одной сторис через index и псевдоним пути — место не выводится, нарушения нет (ограничение)', () => {
    const files = plus(
      buyStory('../shared'),
      browseStory('@shop/ui/shop/shared/promo.screen'),
      file(`${SHOP}/shared/index.ts`, "export * from './promo.screen';\n"),
      file(
        `${SHOP}/shared/promo.screen.ts`,
        define('ScreenDef', 'PromoScreenDef'),
      ),
    );

    expect(run(files)).toEqual([]);
  });

  it('#5: форма monorepo — зоны с src внутри пакетов, {m} в середине шаблона', () => {
    const ui = 'platform/ui/src';
    const logic = 'frontend/shop/logic/src';
    const chat = 'frontend/shop/chat/src';
    const layout: UiNamesLayout = {
      ui,
      logic: 'frontend/{m}/logic/src',
      channels: ['frontend/{m}/chat/src'],
      kits: ['frontend/chat-kit/src'],
      shells: ['runners/bot/src'],
    };
    const files = [
      file(`${ui}/shop-ui.set.ts`, define('UiSetDef', 'ShopUiSetDef')),
      file(
        `${ui}/shop/shop.ui-module.ts`,
        define('UiModuleDef', 'ShopUiModuleDef'),
      ),
      file(`${ui}/shop/buy/buy.story.ts`, story('BuyStoryDef', './pay.screen')),
      file(`${ui}/shop/buy/pay.screen.ts`, define('ScreenDef', 'PayScreenDef')),
      file(`${logic}/buy/pay.scode.ts`, code('ScreenCode', 'PayScreenCode')),
      file(`${chat}/shop-chat.views.ts`, exported('shopChatViews')),
      file(`${chat}/buy/pay.view.ts`, exportedClass('PayView')),
      file('frontend/chat-kit/src/theme.ts', 'export const theme = {};\n'),
      file('runners/bot/src/bot.ui-app.ts', define('UiAppDef', 'BotUiAppDef')),
    ];

    expect(run(files, layout)).toEqual([]);
  });

  it('#22: оболочка — виды оболочки и файлы без вида, в том числе во вложенных каталогах', () => {
    const files = plus(
      file(`${SHELL}/web/shop.graph.ts`, exportedClass('ShopGraph')),
      file(`${SHELL}/web/shop.arch.ts`, exportedClass('ShopArch')),
      file(`${SHELL}/web/shop.routes.ts`, exported('shopRoutes')),
      file(`${SHELL}/web/shop.placements.ts`, exported('shopPlacements')),
      file(`${SHELL}/web/shop.wire.ts`, exported('shopWire')),
      file(`${SHELL}/web/shop-web-views.ts`, exported('shopWebViews')),
      file(`${SHELL}/web/view/control-ids.ts`, exported('controlIds')),
      file(`${SHELL}/shop-codes.ts`, exported('shopCodes')),
    );

    expect(run(files)).toEqual([]);
  });

  it('#24: канал только у одного из модулей — зона не пуста, нарушения нет', () => {
    const files = plus(
      file(
        `${UI}/users/users.ui-module.ts`,
        define('UiModuleDef', 'UsersUiModuleDef'),
      ),
      file(`${of(LOGIC, 'users')}/users-codes.ts`, exported('usersCodes')),
    );

    expect(run(files)).toEqual([]);
  });
});

describe('UiFileNames (NM-01) — суффикс ↔ вид', () => {
  it('S1: Def экрана в файле «.view» — нарушение суффикса', () => {
    const path = `${SHOP}/buy/pay.view.ts`;
    const found = run(plus(file(path, define('ScreenDef', 'PayScreenDef'))));

    has(found, path, 'NM-01 суффикс', 'ScreenDef', '.view', '.screen');
  });

  it('S1: при неверном суффиксе имя не проверяется — одна проблема, одна строка', () => {
    const path = `${SHOP}/buy/pay.view.ts`;
    const found = run(plus(file(path, define('ScreenDef', 'PayScreen'))));

    expect(kinds(found, path)).toEqual(['NM-01 суффикс']);
  });

  it('S2: код экрана в «.code» — нужен «.scode»', () => {
    const path = `${L}/buy/pay.code.ts`;
    const found = run(plus(file(path, code('ScreenCode', 'PayScreenCode'))));

    has(found, path, 'NM-01 суффикс', 'ScreenCode', '.code', '.scode');
  });

  it('S2: код уведомления в «.code» — нужен «.ncode»', () => {
    const path = `${LS}/bought.code.ts`;
    const found = run(
      plus(file(path, code('NotificationCode', 'BoughtNotificationCode'))),
    );

    has(found, path, 'NM-01 суффикс', 'NotificationCode', '.code', '.ncode');
  });

  it('S3: суффикс «.screen» без объявления ScreenDef — нарушение', () => {
    const path = `${SHOP}/buy/pay.screen.ts`;
    const found = run(plus(file(path, 'export const rows = [];\n')));

    has(found, path, 'NM-01 суффикс', 'требует объявления PayScreenDef');
  });

  it('S5: UiAppDef в файле «.app» оболочки — нужен «.ui-app»', () => {
    const path = `${SHELL}/shop.app.ts`;
    const found = run(plus(file(path, define('UiAppDef', 'ShopAppDef'))));

    has(found, path, 'NM-01 суффикс', 'UiAppDef', '.app', '.ui-app');
  });
});

describe('UiFileNames (NM-01) — объявление в тексте', () => {
  it('аннотация типа у const не прячет объявление', () => {
    const path = `${SHOP}/buy/pay.view.ts`;
    const found = run(
      plus(
        file(
          path,
          'export const PayScreenDef: AnyScreenDef = ScreenDef.define({\n});\n',
        ),
      ),
    );

    has(found, path, 'NM-01 суффикс', 'ScreenDef', '.view', '.screen');
  });

  it("'**/*.ts' в строке не открывает комментарий: объявление после неё видно", () => {
    const path = `${SHOP}/buy/pay.screen.ts`;
    const text = `const glob = '**/*.ts';\n${define('ScreenDef', 'PayScreen')}export const tail = '*/';\n`;
    const found = run(plus(file(path, text)));

    expect(kinds(found, path)).toEqual(['NM-01 имя']);
  });
});

describe('UiFileNames (NM-01) — один вид на файл', () => {
  it('S4: ScreenDef и NotificationDef в одном файле — нарушение вида файла', () => {
    const path = `${SHOP}/buy/mixed.screen.ts`;
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
    const path = `${SHOP}/buy/pay.screen.ts`;
    const found = run(
      plus(
        file(
          path,
          define('ScreenDef', 'PayScreenDef') +
            define('ScreenDef', 'PayRowScreenDef'),
        ),
      ),
    );

    has(found, path, 'NM-01 вид файла', 'объявлений ScreenDef: 2');
  });
});

describe('UiFileNames (NM-01) — имя объявления', () => {
  it('N1: Def без «Def» в конце — текст называет ожидаемое и фактическое имя', () => {
    const path = `${SHOP}/buy/pay.screen.ts`;
    const found = run(plus(file(path, define('ScreenDef', 'PayScreen'))));

    expect(found).toEqual([
      {
        file: path,
        line: 1,
        text: 'NM-01 имя: ожидается PayScreenDef (от «pay»), объявлено PayScreen',
      },
    ]);
  });

  it('N2: имя набора — ShopUiSetDef от «shop-ui»', () => {
    const path = `${UI}/shop-ui.set.ts`;
    const found = run(plus(file(path, define('UiSetDef', 'ShopSetDef'))));

    has(found, path, 'NM-01 имя', 'ShopUiSetDef', 'ShopSetDef');
  });

  it('N3: класс кода экрана в others — <Имя>ScreenCode', () => {
    const path = 'acceptance/support/liar-assigned.scode.ts';
    const found = run(plus(file(path, code('ScreenCode', 'LiarAssignedCode'))));

    has(found, path, 'NM-01 имя', 'LiarAssignedScreenCode', 'LiarAssignedCode');
  });

  it('N4: имена канала — <Имя>View и <имя>Views', () => {
    const view = `${C}/buy/pay.view.ts`;
    const views = `${C}/shop-chat.views.ts`;
    const found = run(
      plus(
        file(view, exportedClass('PaymentView')),
        file(views, exported('ShopChatViews')),
      ),
    );

    has(found, view, 'NM-01 имя', 'PayView', 'PaymentView');
    has(found, views, 'NM-01 имя', 'shopChatViews', 'ShopChatViews');
  });
});

describe('UiFileNames (NM-01) — место в описании', () => {
  it('P1: экран в корне описания, не в папке UI-модуля', () => {
    const path = `${UI}/extra.screen.ts`;
    const found = run(plus(file(path, define('ScreenDef', 'ExtraScreenDef'))));

    expect(found).toHaveLength(1);
    has(found, path, 'NM-01 место');
  });

  it('P3: папка с экранами без своего <m>.ui-module.ts', () => {
    const path = `${UI}/orders/list/order-list.screen.ts`;
    const found = run(
      plus(file(path, define('ScreenDef', 'OrderListScreenDef'))),
    );

    has(
      found,
      path,
      'NM-01 место',
      'в папке «orders»',
      'нет orders.ui-module.ts',
    );
  });

  it('P4: «.set» не в корне описания — нарушение места', () => {
    const path = `${SHOP}/shop-ui.set.ts`;
    const found = run(plus(file(path, define('UiSetDef', 'ShopUiSetDef'))));

    has(found, path, 'NM-01 место');
  });

  it('P4: чужой «.ui-module» в папке модуля — нарушение места', () => {
    const path = `${SHOP}/orders.ui-module.ts`;
    const found = run(
      plus(file(path, define('UiModuleDef', 'OrdersUiModuleDef'))),
    );

    has(found, path, 'NM-01 место');
  });

  it('#6: экран одной сторис в shared/ — место у сторис', () => {
    const path = `${SHOP}/shared/solo.screen.ts`;
    const found = run(
      plus(
        buyStory('../shared/solo.screen'),
        file(path, define('ScreenDef', 'SoloScreenDef')),
      ),
    );

    expect(kinds(found, path)).toEqual(['NM-01 место']);
    has(found, path, 'NM-01 место', `${SHOP}/buy/solo.screen.ts`);
  });

  it('#7: экран сторис buy в папке сторис browse — место у своей сторис', () => {
    const path = `${SHOP}/browse/stray.screen.ts`;
    const found = run(
      plus(
        buyStory('../browse/stray.screen'),
        file(path, define('ScreenDef', 'StrayScreenDef')),
      ),
    );

    expect(kinds(found, path)).toEqual(['NM-01 место']);
    has(found, path, 'NM-01 место', `${SHOP}/buy/stray.screen.ts`);
  });

  it('#8: экран двух сторис в папке одной из них — место в shared/', () => {
    const path = `${SHOP}/buy/pay.screen.ts`;
    const found = run(plus(browseStory('../buy/pay.screen')));

    expect(kinds(found, path)).toEqual(['NM-01 место']);
    has(found, path, 'NM-01 место', `${SHOP}/shared/pay.screen.ts`);
  });

  it('#9: экран и уведомление в корне модуля — нарушение места', () => {
    const screen = `${SHOP}/extra.screen.ts`;
    const notification = `${SHOP}/sent.notification.ts`;
    const found = run(
      plus(
        file(screen, define('ScreenDef', 'ExtraScreenDef')),
        file(notification, define('NotificationDef', 'SentNotificationDef')),
      ),
    );

    expect(kinds(found, screen)).toEqual(['NM-01 место']);
    expect(kinds(found, notification)).toEqual(['NM-01 место']);
  });

  it('#10: помощник без вида в корне модуля — нарушение места', () => {
    const path = `${SHOP}/shop-rows.ts`;
    const found = run(plus(file(path, 'export const rows = [];\n')));

    expect(kinds(found, path)).toEqual(['NM-01 место']);
  });

  it('#11: папка глубже одного уровня в модуле — нарушение места', () => {
    const path = `${SHOP}/buy/extra/rows.ts`;
    const found = run(plus(file(path, 'export const rows = [];\n')));

    expect(kinds(found, path)).toEqual(['NM-01 место']);
  });

  it('#12: сторис не в папке своего имени — нарушение места', () => {
    const path = `${SHOP}/browse/checkout.story.ts`;
    const found = run(plus(file(path, story('CheckoutStoryDef'))));

    expect(kinds(found, path)).toEqual(['NM-01 место']);
    has(found, path, 'NM-01 место', `${SHOP}/checkout/checkout.story.ts`);
  });

  it('#12: сторис в shared/ — нарушение места', () => {
    const path = `${SHOP}/shared/promo.story.ts`;
    const found = run(plus(file(path, story('PromoStoryDef'))));

    expect(kinds(found, path)).toEqual(['NM-01 место']);
  });

  it('#12: сторис с именем shared в своей папке — нарушение места, имя занято общими экранами', () => {
    const path = `${SHOP}/shared/shared.story.ts`;
    const found = run(plus(file(path, story('SharedStoryDef'))));

    expect(kinds(found, path)).toEqual(['NM-01 место']);
    has(found, path, 'NM-01 место', 'имя сторис «shared»');
  });

  it('#13: «.scode» и «.ncode» в описании — нарушение места', () => {
    const scode = `${SHOP}/buy/pay.scode.ts`;
    const ncode = `${SHOP}/shared/bought.ncode.ts`;
    const found = run(
      plus(
        file(scode, code('ScreenCode', 'PayScreenCode')),
        file(ncode, code('NotificationCode', 'BoughtNotificationCode')),
      ),
    );

    expect(kinds(found, scode)).toEqual(['NM-01 место']);
    expect(kinds(found, ncode)).toEqual(['NM-01 место']);
    has(found, scode, 'NM-01 место', '.scode');
    has(found, ncode, 'NM-01 место', '.ncode');
  });

  it('#14: вид канала и вид оболочки в описании — нарушение места', () => {
    const view = `${SHOP}/buy/pay.view.ts`;
    const app = `${UI}/shop.ui-app.ts`;
    const found = run(
      plus(
        file(view, exportedClass('PayView')),
        file(app, define('UiAppDef', 'ShopUiAppDef')),
      ),
    );

    expect(kinds(found, view)).toEqual(['NM-01 место']);
    expect(kinds(found, app)).toEqual(['NM-01 место']);
    has(found, view, 'NM-01 место', '.view');
    has(found, app, 'NM-01 место', '.ui-app');
  });
});

describe('UiFileNames (NM-01) — место в коде модуля (logic)', () => {
  it('#15: «.scode» без «.screen» по тому же пути в описании — нарушение места', () => {
    const path = `${L}/browse/cart.scode.ts`;
    const found = run(plus(file(path, code('ScreenCode', 'CartScreenCode'))));

    expect(kinds(found, path)).toEqual(['NM-01 место']);
    has(found, path, 'NM-01 место', `${SHOP}/browse/cart.screen.ts`);
  });

  it('#16: «.scode» в корне logic — нарушение места', () => {
    const path = `${L}/pay.scode.ts`;
    const found = run(plus(file(path, code('ScreenCode', 'PayScreenCode'))));

    expect(kinds(found, path)).toEqual(['NM-01 место']);
  });

  it('#17: экран и сторис в logic — нарушение места', () => {
    const screen = `${L}/buy/pay.screen.ts`;
    const storyPath = `${L}/buy/buy.story.ts`;
    const found = run(
      plus(
        file(screen, define('ScreenDef', 'PayScreenDef')),
        file(storyPath, story('BuyStoryDef', './pay.screen')),
      ),
    );

    expect(kinds(found, screen)).toEqual(['NM-01 место']);
    expect(kinds(found, storyPath)).toEqual(['NM-01 место']);
    has(found, screen, 'NM-01 место', '.screen');
    has(found, storyPath, 'NM-01 место', '.story');
  });

  it('#18: папка глубже одного уровня в logic — нарушение места', () => {
    const path = `${L}/buy/extra/rows.ts`;
    const found = run(plus(file(path, 'export const rows = [];\n')));

    expect(kinds(found, path)).toEqual(['NM-01 место']);
  });
});

describe('UiFileNames (NM-01) — место в канале модуля', () => {
  it('#19: «.view» без экрана или уведомления по тому же пути — нарушение места', () => {
    const path = `${C}/browse/cart.view.ts`;
    const found = run(plus(file(path, exportedClass('CartView'))));

    expect(kinds(found, path)).toEqual(['NM-01 место']);
    has(found, path, 'NM-01 место', `${SHOP}/browse/cart.`);
  });

  it('#20: «.views» не в корне канала — нарушение места', () => {
    const path = `${C}/buy/shop-chat.views.ts`;
    const found = run(plus(file(path, exported('shopChatViews'))));

    expect(kinds(found, path)).toEqual(['NM-01 место']);
  });

  it('P5: «.screen» в канале — вид описания, нарушение места', () => {
    const path = `${C}/buy/pay.screen.ts`;
    const found = run(plus(file(path, define('ScreenDef', 'PayScreenDef'))));

    expect(kinds(found, path)).toEqual(['NM-01 место']);
    has(found, path, 'NM-01 место', '.screen');
  });
});

describe('UiFileNames (NM-01) — kit и оболочка', () => {
  it('#21: экран, сторис, код экрана и вид модуля в kit — нарушение места', () => {
    const paths = {
      screen: `${KIT}/card.screen.ts`,
      story: `${KIT}/card.story.ts`,
      scode: `${KIT}/card.scode.ts`,
      view: `${KIT}/card.view.ts`,
    };
    const found = run(
      plus(
        file(paths.screen, define('ScreenDef', 'CardScreenDef')),
        file(paths.story, story('CardStoryDef')),
        file(paths.scode, code('ScreenCode', 'CardScreenCode')),
        file(paths.view, exportedClass('CardView')),
      ),
    );

    for (const [suffix, path] of Object.entries(paths)) {
      expect(kinds(found, path)).toEqual(['NM-01 место']);
      has(found, path, 'NM-01 место', `.${suffix}`);
    }
  });

  it('#22: экран, код экрана, вид и реестр видов в оболочке — нарушение места', () => {
    const paths = {
      screen: `${SHELL}/pay.screen.ts`,
      scode: `${SHELL}/pay.scode.ts`,
      view: `${SHELL}/pay.view.ts`,
      views: `${SHELL}/shop.views.ts`,
    };
    const found = run(
      plus(
        file(paths.screen, define('ScreenDef', 'PayScreenDef')),
        file(paths.scode, code('ScreenCode', 'PayScreenCode')),
        file(paths.view, exportedClass('PayView')),
        file(paths.views, exported('shopViews')),
      ),
    );

    for (const [suffix, path] of Object.entries(paths)) {
      expect(kinds(found, path)).toEqual(['NM-01 место']);
      has(found, path, 'NM-01 место', `.${suffix}`);
    }
  });
});

describe('UiFileNames (NM-01) — тест рядом', () => {
  it('T1: тест кода без своего файла рядом', () => {
    const path = `${L}/buy/cart.scode.test.ts`;
    const found = run(plus(test(path)));

    has(found, path, 'NM-01 тест', '«cart.scode.test.ts» без файла рядом');
  });

  it('T1: тест при своём файле рядом — зелёное', () => {
    const found = run(plus(test(`${L}/buy/pay.scode.test.ts`)));

    expect(found).toEqual([]);
  });

  it('T2: однословная тема при соседях с общим префиксом — нарушение', () => {
    const path = `${LS}/cart-list.test.ts`;
    const found = run(
      plus(file(`${LS}/cart-rows.ts`, 'export const rows = [];\n'), test(path)),
    );

    has(found, path, 'NM-01 тест', '«cart-list.test.ts» без файла рядом');
  });

  it('T2: при cart-list.ts рядом — зелёное', () => {
    const found = run(
      plus(
        file(`${LS}/cart-list.ts`, 'export const list = [];\n'),
        test(`${LS}/cart-list.test.ts`),
      ),
    );

    expect(found).toEqual([]);
  });

  it('T3: тема с головой <тема>.<вид>.ts — зелёное', () => {
    const found = run(plus(cartScode, test(`${LS}/cart-help.test.ts`)));

    expect(found).toEqual([]);
  });

  it('T3: <m>.ui-module.ts головой темы не служит — shop-list.test.ts в корне модуля нарушение', () => {
    const path = `${SHOP}/shop-list.test.ts`;
    const found = run(plus(test(path)));

    has(found, path, 'NM-01 тест', '«shop-list.test.ts» без файла рядом');
  });

  it('T3: при одном cart-list.types.ts головы нет — нарушение', () => {
    const path = `${LS}/cart-list-help.test.ts`;
    const found = run(
      plus(
        file(`${LS}/cart-list.types.ts`, 'export type Row = number;\n'),
        test(path),
      ),
    );

    has(found, path, 'NM-01 тест', '«cart-list-help.test.ts» без файла рядом');
  });

  it('T4: грань при <файл>.ts — зелёное', () => {
    const found = run(
      plus(cartScode, test(`${LS}/cart.scode.refresh.test.ts`)),
    );

    expect(found).toEqual([]);
  });

  it('T4: грань без <файл>.ts — нарушение', () => {
    const path = `${LS}/cart.scode.refresh.test.ts`;
    const found = run(plus(test(path)));

    has(found, path, 'NM-01 тест', 'без файла рядом');
  });

  it('T5: readme.test.ts допустим без файла рядом', () => {
    const found = run(plus(test(`${LS}/readme.test.ts`)));

    expect(found).toEqual([]);
  });

  it('T5: «.browser.test.ts» проверке теста рядом не подлежит', () => {
    const found = run(plus(test(`${LS}/page.browser.test.ts`)));

    expect(found).toEqual([]);
  });

  it('T5: <x>.story.test.ts при своём <x>.story.ts — зелёное', () => {
    const found = run(plus(test(`${SHOP}/buy/buy.story.test.ts`)));

    expect(found).toEqual([]);
  });

  it('тест рядом проверяется в зонах описания, кода и каналов без поля tests', () => {
    const path = 'f/m/logic/shared/orphan.scode.test.ts';
    const found = run(
      [
        file('u/m/m.ui-module.ts', define('UiModuleDef', 'MUiModuleDef')),
        file('f/m/logic/m-codes.ts', exported('mCodes')),
        file('f/m/chat/m-chat.views.ts', exported('mChatViews')),
        test(path),
      ],
      { ui: 'u', logic: 'f/{m}/logic', channels: ['f/{m}/chat'] },
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
  it('#23: код и канал модуля без UI-модуля описания — нарушение места', () => {
    const logic = `${of(LOGIC, 'orders')}/orders-codes.ts`;
    const chat = `${of(CHAT, 'orders')}/orders-chat.views.ts`;
    const found = run(
      plus(
        file(logic, exported('ordersCodes')),
        file(chat, exported('ordersChatViews')),
      ),
    );

    has(found, logic, 'NM-01 место', 'orders.ui-module.ts');
    has(found, chat, 'NM-01 место', 'orders.ui-module.ts');
  });

  /** Зона и признак её файлов в `BASE`: без этих файлов зона пуста. */
  const ZONES: readonly (readonly [string, string, string])[] = [
    ['ui', UI, `${UI}/`],
    ['logic', LOGIC, `${L}/`],
    ['channels', WEB, `${W}/`],
    ['kits', KIT, `${KIT}/`],
    ['shells', SHELL, `${SHELL}/`],
  ];
  for (const [field, zone, prefix] of ZONES) {
    it(`#24: пустая зона ${field} — нарушение, а не молчаливый зелёный`, () => {
      const files = BASE.filter((f) => !f.path.startsWith(prefix));
      const found = run(files);

      const empty = found.filter((v) => v.text.startsWith('NM-01 зона'));
      expect(empty.map((v) => v.file)).toEqual([zone]);
      has(found, zone, 'NM-01 зона', `в «${zone}» нет файлов`);
    });
  }

  it('раскладка с {m} не по месту — конструктор бросает и называет шаблон', () => {
    const broken: readonly (readonly [UiNamesLayout, string])[] = [
      [
        { ...LAYOUT, logic: 'src/frontend/logic' },
        '«src/frontend/logic» — в шаблоне logic и channels нужен ровно один {m}',
      ],
      [
        { ...LAYOUT, channels: ['src/frontend/{m}/chat/{m}'] },
        '«src/frontend/{m}/chat/{m}» — в шаблоне logic и channels нужен ровно один {m}',
      ],
      [
        { ...LAYOUT, kits: ['src/frontend/{m}-kit'] },
        '«src/frontend/{m}-kit» — {m} допустим только в logic и channels',
      ],
    ];

    for (const [layout, text] of broken) {
      expect(() => new UiFileNames(layout)).toThrow(text);
    }
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
      exportedClass('PayView'),
    ].join('\n');
    const found = run(plus(file(`${C}/buy/pay.view.ts`, text)));

    expect(found).toEqual([]);
  });

  for (const suffix of ['fixture', 'test-kit']) {
    it(`Q4: «*.${suffix}.ts» из проверок вида и имени исключён`, () => {
      const path = `${SHOP}/buy/x.${suffix}.ts`;
      const found = run(plus(file(path, define('ScreenDef', 'Whatever'))));

      expect(found).toEqual([]);
    });
  }

  it('Q5: суффикс вне словаря без объявления вида не флагируется', () => {
    const found = run(
      plus(file(`${SHELL}/shop-bot.community.ts`, exported('shopBot'))),
    );

    expect(found).toEqual([]);
  });

  it('Q6: строка нарушения — строка объявления после комментария в 6 строк', () => {
    const comment = '/**\n * a\n * b\n * c\n * d\n */\n';
    const path = `${SHOP}/buy/pay.screen.ts`;
    const found = run(
      plus(file(path, comment + define('ScreenDef', 'PayScreen'))),
    );

    expect(found.map((v) => v.line)).toEqual([7]);
    has(found, path, 'NM-01 имя');
  });
});
