import { builtinModules } from 'node:module';
import { posix, resolve } from 'node:path';
import type { ImportZone } from './core-import-scanner.types';
import { ModuleSpecifiers } from './module-specifiers';
import { PackageManifest } from './package-manifest';
import type { SourceFile } from './source-tree';
import type { Violation } from './violation.types';

/** Учебный проект (D-UI-121): места слоёв — описание, фронт модулей, kit и раннеры. */
const EXAMPLE = 'packages/example/src';
/** Описание UI учебного проекта (слой `ui`). */
const EXAMPLE_UI = `${EXAMPLE}/platform/ui`;
/** Фронт учебного проекта: `<m>/logic`, `<m>/<канал>`, `<канал>-kit`. */
const FRONTEND = `${EXAMPLE}/frontend`;
/** Раннеры учебного проекта: общая сборка в корне, `dialog`, `tg-bot`, `web`. */
const RUNNERS = `${EXAMPLE}/runners`;
/** Раннер `web`: оболочка в корне и четыре каталога, у каждого своя зона. */
const WEB_RUNNER = `${RUNNERS}/web`;
/** Файлы `ArchApp` раннеров: вход графа, сборка проверки и общие места двух графов. */
const ARCH_FILES = ['.arch.ts', '.graph.ts', '-arch.const.ts'];
/** Пакет страничного канала: код входа `dmg-ui/web-ui`, подкаталоги разделены границей JSON. */
const PAGE = 'packages/web-ui/src';
/** Тестовый вход пакета страничного канала: привязка примера. */
const WEB_UI_TESTING = 'packages/web-ui/testing';
const PAGE_CLIENT = `${PAGE}/client`;
const PAGE_SERVER = `${PAGE}/server`;
const PAGE_WIRE = `${PAGE}/wire`;
const PAGE_GRAPH = `${PAGE}/graph`;
/** Представления страничного канала: видят только себя и публичные входы ядра. */
const PAGE_VIEW = `${PAGE}/view`;
/** Кодек адреса страничного канала: строка на входе и выходе, никого из канала не видит. */
const PAGE_URL = `${PAGE}/url`;
/** Помощник рендера примеров: от канала и сервера не зависит. */
const PREVIEW = 'packages/core/testing/preview';
/** Пакет диалогового канала: код входа `dmg-ui/chat-ui`. */
const CHAT_UI = 'packages/chat-ui/src';
/** Граф диалогового канала: без реализаций канала (D-UI-118). */
const CHAT_UI_GRAPH = `${CHAT_UI}/graph`;
/** Тестовый вход пакета диалогового канала: привязка примера. */
const CHAT_UI_TESTING = 'packages/chat-ui/testing';
/** Пакет канала Telegram: код входа `dmg-ui/tg-bot`. */
const TG_BOT = 'packages/tg-bot/src';
/** Пакет канала Telegram: тестовый вход `dmg-ui/tg-bot/testing` (зарезервирован). */
const TG_BOT_TESTING = 'packages/tg-bot/testing';
/** Пакеты каналов: каждый файл лежит в каталоге с зоной (`src/` или `testing/`). */
const CHANNEL_PACKAGES = [
  'packages/chat-ui',
  'packages/tg-bot',
  'packages/web-ui',
];
const CHANNEL_DIRS = ['src', 'testing'];
/** Корень репо: из него читается манифест по умолчанию. */
const ROOT = resolve(import.meta.dir, '..');
/** Приёмочные тесты монорепо: поверх нескольких пакетов, импорт по именам входов. */
const ACCEPTANCE = 'acceptance';
/** Браузерные тесты и клиент DevTools: среда и тестовые входы разрешены, код примера — только сервер. */
const BROWSER = 'browser';

/** Проверка импортов ядра по набору зон: `node:`, `bun:`, встроенные модули и тестовые входы `dmg-core` запрещены. */
export class CoreImportScanner {
  constructor(protected readonly zones: ImportZone[]) {}

  /**
   * Зоны репо (TST-07): ядро (`packages/core/src`, кроме тестов, `graph/` и
   * `server/`), граф (`src/graph`, где разрешён `dmg-core/graph`), сервер
   * (`src/server`: плюс `dmg-core/app` и `/graph`, без `graph/` ядра),
   * помощник рендера (`testing/preview/`: без сервера и графа). Пакеты
   * каналов: `web-ui/src` (у `client/`, `view/`, `wire/`, `server/`, `graph/`
   * и корня свои белые списки, клиент не знает сервер и граф, сервер не знает
   * клиент, `view/` видит только себя, граф — не `view/` и не клиент),
   * `chat-ui/src` (публичные входы ядра; относительные — внутри пакета,
   * ARC-08; граф `graph/` — без реализаций канала), `tg-bot/src` (как
   * `chat-ui/src`, плюс `dmg-ui/chat-ui`, без внешних библиотек); тестовые
   * каталоги `testing/` пакетов — плюс тестовые входы, учебный проект
   * `dmg-ui/example` и вход своего канала; пакеты каналов друг друга не знают
   * (`PackageDirections`). Учебный проект `packages/example/src`: описание и
   * `frontend/<m>/logic` — только `valibot`, `dmg-core`, `dmg-ui` и контракты
   * учебного приложения, как у проекта; виды `frontend/<m>/<канал>` и kit —
   * плюс публичный вход своего канала, web — ещё без среды браузера; раннеры
   * `dialog` и `tg-bot` — сборка приложения и тестовые входы (`tg-bot` — плюс
   * среда и `grammy`), файлы `ArchApp` — плюс граф и путь к входу графа.
   * Относительные импорты между местами проекта держат слои (`LayerChecker`),
   * выход из пакета — `PackageDirections`. Раннер `web`: `common/` не знает
   * никого, в сборку для браузера (оболочка в корне, `common/`, `view/`,
   * `client/`) среда и серверные входы не попадают, они не видят сервер и
   * фикстуру тестов `testing/`; сервер (`node:*`, `bun:*`, `dmg-core/app`,
   * `dmg-core/arch`) и `testing/` не видят клиента. Приёмочный каталог
   * `acceptance/` не ограничен, но в `packages/` заходит только по именам
   * входов: относительно и по `dmg-ui/...`, не совпадающему с входом из
   * `exports`.
   */
  static standard(
    manifest: PackageManifest = PackageManifest.read(ROOT),
  ): CoreImportScanner {
    const forbidden = [
      'node:*',
      'bun:*',
      ...builtinModules,
      'dmg-core/testing',
      'dmg-core/testing/*',
      'dmg-ui/testing',
      'dmg-core/gen',
      'dmg-core/cli',
    ];
    // Тестовые каталоги пакетов и раннеры: тестовые входы разрешены белым списком.
    const testingForbidden = forbidden.filter(
      (spec) =>
        spec !== 'dmg-core/testing/*' &&
        spec !== 'dmg-core/testing' &&
        spec !== 'dmg-ui/testing',
    );
    // Учебный проект: без `dmg-core/testing/*` из общего списка — контракты
    // учебного приложения (`dmg-core/testing/example`) ему разрешены.
    const exampleForbidden = forbidden.filter(
      (spec) => spec !== 'dmg-core/testing/*',
    );
    const exampleAllowed = [
      'valibot',
      'dmg-core',
      'dmg-ui',
      'dmg-core/testing/example',
    ];
    const chatTestingAllowed = [
      'valibot',
      'dmg-core',
      'dmg-core/graph',
      'dmg-core/arch',
      'dmg-core/testing',
      'dmg-core/testing/example',
      'dmg-ui',
      'dmg-ui/server',
      'dmg-ui/graph',
      'dmg-ui/testing',
      'dmg-ui/chat-ui',
    ];
    const tgTestingAllowed = [
      ...chatTestingAllowed,
      'dmg-ui/testing/fixtures',
      'dmg-ui/chat-ui/testing',
      'dmg-ui/tg-bot',
    ];
    // Каталоги примера, едущие в сборку для браузера: ни среды, ни серверных
    // входов платформы; учебный домен и тестовые входы пакета — разрешены.
    const browserForbidden = forbidden.filter(
      (spec) => spec !== 'dmg-core/testing/*' && spec !== 'dmg-ui/testing',
    );
    const browserAllowed = [
      'valibot',
      'dmg-core',
      'dmg-core/testing/example',
      'dmg-ui',
      'dmg-ui/testing',
      'dmg-ui/web-ui',
      'dmg-ui/web-ui/testing',
    ];
    return new CoreImportScanner([
      {
        include: ['packages/core/src/'],
        exclude: ['.test.ts'],
        excludeDirs: ['packages/core/src/graph/', 'packages/core/src/server/'],
        forbidden,
        allowed: ['valibot', 'dmg-core'],
        forbiddenPaths: [
          'packages/core/testing',
          'packages/core/src/graph',
          'packages/core/src/server',
        ],
      },
      {
        include: ['packages/core/src/graph/'],
        exclude: ['.test.ts'],
        forbidden,
        allowed: ['valibot', 'dmg-core', 'dmg-core/graph'],
        forbiddenPaths: ['packages/core/testing'],
      },
      {
        include: ['packages/core/src/server/'],
        exclude: ['.test.ts'],
        forbidden,
        allowed: ['valibot', 'dmg-core', 'dmg-core/app', 'dmg-core/graph'],
        forbiddenPaths: ['packages/core/testing', 'packages/core/src/graph'],
      },
      {
        include: [`${PAGE_CLIENT}/`],
        exclude: ['.test.ts'],
        forbidden,
        allowed: ['valibot', 'dmg-core', 'dmg-ui'],
        // Имя канала — для проверки приложения при сборке вкладки.
        allowedPaths: [
          PAGE_CLIENT,
          PAGE_VIEW,
          PAGE_WIRE,
          PAGE_URL,
          `${PAGE}/page-channel.const`,
        ],
      },
      {
        include: [`${PAGE_VIEW}/`],
        exclude: ['.test.ts'],
        forbidden,
        allowed: ['valibot', 'dmg-core', 'dmg-ui'],
        // Представление получает только источник и цель показа (D-UI-70).
        allowedPaths: [PAGE_VIEW],
      },
      {
        include: [`${PAGE_WIRE}/`],
        exclude: ['.test.ts'],
        forbidden,
        allowed: ['valibot', 'dmg-core', 'dmg-ui'],
        allowedPaths: [PAGE_WIRE],
      },
      {
        include: [`${PAGE_URL}/`],
        exclude: ['.test.ts'],
        forbidden,
        allowed: ['valibot', 'dmg-core', 'dmg-ui'],
        // Кодек адреса — строка на входе и выходе, никого из канала не видит.
        allowedPaths: [PAGE_URL],
      },
      {
        include: [`${PAGE_SERVER}/`],
        exclude: ['.test.ts'],
        forbidden,
        allowed: ['valibot', 'dmg-core', 'dmg-ui', 'dmg-ui/server'],
        // Имя канала — для проверки приложения при сборке хоста.
        allowedPaths: [PAGE_SERVER, PAGE_WIRE, `${PAGE}/page-channel.const`],
      },
      {
        include: [`${PAGE_GRAPH}/`],
        exclude: ['.test.ts'],
        forbidden,
        allowed: [
          'valibot',
          'dmg-core',
          'dmg-core/graph',
          'dmg-ui',
          'dmg-ui/graph',
        ],
        // Имя канала и версию поставщика граф берёт из `page-channel.const`,
        // маршрут и разбор его шаблона — из `url/`. Представлений граф не
        // видит: их полноту держат конструкторы реестров.
        allowedPaths: [PAGE_GRAPH, PAGE_URL, `${PAGE}/page-channel.const`],
      },
      {
        include: [`${PAGE}/`],
        exclude: ['.test.ts'],
        // Корень канала — файлы `src/*.ts`; подкаталоги имеют свои зоны.
        excludeDirs: [
          `${PAGE_CLIENT}/`,
          `${PAGE_VIEW}/`,
          `${PAGE_SERVER}/`,
          `${PAGE_WIRE}/`,
          `${PAGE_GRAPH}/`,
          `${PAGE_URL}/`,
        ],
        forbidden,
        allowed: [
          'valibot',
          'dmg-core',
          'dmg-core/graph',
          'dmg-ui',
          'dmg-ui/server',
          'dmg-ui/graph',
        ],
        allowedPaths: [PAGE],
      },
      {
        include: [`${WEB_UI_TESTING}/`],
        exclude: ['.test.ts'],
        // Текстовой фикстуре нужны `ExampleAppDef` и учебный проект: тестовые входы разрешены.
        forbidden: testingForbidden,
        allowed: [
          'valibot',
          'dmg-core',
          'dmg-core/graph',
          'dmg-core/arch',
          'dmg-core/testing',
          'dmg-core/testing/example',
          'dmg-ui',
          'dmg-ui/server',
          'dmg-ui/graph',
          'dmg-ui/testing',
          'dmg-ui/testing/fixtures',
          'dmg-ui/web-ui',
          'dmg-ui/example',
        ],
        allowedPaths: [WEB_UI_TESTING],
      },
      {
        include: [`${EXAMPLE_UI}/`, `${FRONTEND}/*/logic/`],
        exclude: ['.test.ts'],
        // Описание и код модулей — как у проекта.
        forbidden: exampleForbidden,
        allowed: exampleAllowed,
      },
      {
        include: [`${FRONTEND}/*/chat/`, `${FRONTEND}/chat-kit/`],
        exclude: ['.test.ts'],
        forbidden: exampleForbidden,
        allowed: [...exampleAllowed, 'dmg-ui/chat-ui'],
      },
      {
        include: [`${FRONTEND}/*/telegram/`, `${FRONTEND}/telegram-kit/`],
        exclude: ['.test.ts'],
        // Telegram — на базе диалога: плюс вход своего канала.
        forbidden: exampleForbidden,
        allowed: [...exampleAllowed, 'dmg-ui/chat-ui', 'dmg-ui/tg-bot'],
      },
      {
        include: [`${FRONTEND}/*/web/`, `${FRONTEND}/web-kit/`],
        exclude: ['.test.ts'],
        // Виды web едут в сборку для браузера.
        forbidden: browserForbidden,
        allowed: [...exampleAllowed, 'dmg-ui/web-ui'],
      },
      {
        include: [`${RUNNERS}/`],
        exclude: ['.test.ts', ...ARCH_FILES],
        // Корень раннеров — сборка кода модулей: её берёт и клиент web.
        excludeDirs: [
          `${RUNNERS}/dialog/`,
          `${RUNNERS}/tg-bot/`,
          `${WEB_RUNNER}/`,
        ],
        forbidden: exampleForbidden,
        allowed: exampleAllowed,
      },
      {
        include: [`${RUNNERS}/`],
        suffixes: ARCH_FILES,
        exclude: ['.test.ts'],
        // Вход графа и сборка проверки: путь к входу графа, граф, тестовые
        // входы и поставщики каналов; DOM-клиента не видят.
        forbidden: [],
        allowed: [
          'node:path',
          'valibot',
          'dmg-core',
          'dmg-core/arch',
          'dmg-core/graph',
          'dmg-core/testing',
          'dmg-core/testing/example',
          'dmg-ui',
          'dmg-ui/graph',
          'dmg-ui/chat-ui',
          'dmg-ui/chat-ui/testing',
          'dmg-ui/web-ui',
        ],
        forbiddenPaths: [`${WEB_RUNNER}/client`],
      },
      {
        include: [`${RUNNERS}/dialog/`],
        exclude: ['.test.ts', ...ARCH_FILES],
        forbidden: testingForbidden,
        allowed: chatTestingAllowed,
      },
      {
        include: [`${RUNNERS}/tg-bot/`],
        exclude: ['.test.ts', ...ARCH_FILES],
        // Бот и проба: среда и `grammy` (место адаптера держит
        // `ExampleZoneScanner`), платформа приложения и тестовые входы.
        forbidden: [],
        allowed: [
          'node:*',
          'grammy',
          ...tgTestingAllowed,
          'dmg-core/app',
          'dmg-ui/tg-bot/testing',
        ],
      },
      {
        include: [`${WEB_RUNNER}/`],
        exclude: ['.test.ts', ...ARCH_FILES],
        // Оболочка web (приложение UI, маршруты, раскладки, провод, сборка
        // видов) едет в сборку для браузера.
        excludeDirs: [
          `${WEB_RUNNER}/common/`,
          `${WEB_RUNNER}/view/`,
          `${WEB_RUNNER}/client/`,
          `${WEB_RUNNER}/server/`,
          `${WEB_RUNNER}/testing/`,
        ],
        forbidden: browserForbidden,
        allowed: browserAllowed,
        forbiddenPaths: [
          `${WEB_RUNNER}/client`,
          `${WEB_RUNNER}/server`,
          `${WEB_RUNNER}/testing`,
        ],
      },
      {
        include: [`${WEB_RUNNER}/common/`],
        exclude: ['.test.ts'],
        forbidden: browserForbidden,
        allowed: ['valibot'],
        // Общее не знает никого: ни моделей, ни клиента, ни сервера.
        allowedPaths: [`${WEB_RUNNER}/common`],
      },
      {
        include: [`${WEB_RUNNER}/view/`],
        exclude: ['.test.ts'],
        forbidden: browserForbidden,
        allowed: browserAllowed,
        // DOM-помощники делят сервер, клиент и тесты: ни клиента, ни сервера.
        forbiddenPaths: [
          `${WEB_RUNNER}/client`,
          `${WEB_RUNNER}/server`,
          `${WEB_RUNNER}/testing`,
        ],
      },
      {
        include: [`${WEB_RUNNER}/client/`],
        exclude: ['.test.ts'],
        forbidden: browserForbidden,
        allowed: browserAllowed,
        forbiddenPaths: [`${WEB_RUNNER}/server`, `${WEB_RUNNER}/testing`],
      },
      {
        include: [`${WEB_RUNNER}/server/`],
        exclude: ['.test.ts'],
        // Среда сервера — `node:*` и `bun:*`; остальное закрыто белым списком.
        forbidden: [],
        allowed: [
          'node:*',
          'bun:*',
          'valibot',
          'dmg-core',
          'dmg-core/app',
          'dmg-core/arch',
          'dmg-core/testing',
          'dmg-core/testing/example',
          'dmg-ui',
          'dmg-ui/server',
          'dmg-ui/graph',
          'dmg-ui/testing',
          'dmg-ui/testing/fixtures',
          'dmg-ui/web-ui',
          'dmg-ui/web-ui/testing',
        ],
        // Клиента сервер не видит: корневая программа не знает типов браузера.
        forbiddenPaths: [`${WEB_RUNNER}/client`],
      },
      {
        include: [`${WEB_RUNNER}/testing/`],
        exclude: ['.test.ts'],
        // Общая фикстура тестов раннера: то же, что тесты сервера; клиента нет.
        forbidden: [],
        allowed: [
          'node:*',
          'bun:test',
          'valibot',
          'dmg-core',
          'dmg-core/app',
          'dmg-core/testing',
          'dmg-core/testing/example',
          'dmg-ui',
          'dmg-ui/server',
          'dmg-ui/testing',
          'dmg-ui/testing/fixtures',
          'dmg-ui/web-ui',
          'dmg-ui/web-ui/testing',
        ],
        forbiddenPaths: [`${WEB_RUNNER}/client`],
      },
      {
        include: [`${PREVIEW}/`],
        exclude: ['.test.ts'],
        forbidden,
        allowed: ['valibot', 'dmg-core', 'dmg-ui'],
        allowedPaths: [PREVIEW],
      },
      {
        include: [`${CHAT_UI}/`],
        exclude: ['.test.ts'],
        excludeDirs: [`${CHAT_UI_GRAPH}/`],
        forbidden,
        allowed: [
          'valibot',
          'dmg-core',
          'dmg-core/graph',
          // Подписка на события — `EventSubscriber` платформы (D-98 `dmg-core`, D-UI-59).
          'dmg-core/app',
          'dmg-ui',
          'dmg-ui/server',
          'dmg-ui/graph',
        ],
        allowedPaths: [CHAT_UI],
      },
      {
        include: [`${CHAT_UI_GRAPH}/`],
        exclude: ['.test.ts'],
        forbidden,
        allowed: [
          'valibot',
          'dmg-core',
          'dmg-core/graph',
          'dmg-ui',
          'dmg-ui/graph',
        ],
        // Граф без реализаций: своё, манифест сообществ и возможности
        // мессенджера; ни видов, ни беседы, ни рендера.
        allowedPaths: [
          CHAT_UI_GRAPH,
          `${CHAT_UI}/community/community-manifest`,
          `${CHAT_UI}/community/community.types`,
          `${CHAT_UI}/messenger`,
        ],
      },
      {
        include: [`${CHAT_UI_TESTING}/`],
        exclude: ['.test.ts'],
        // Примерам набора и лимитам нужны `ExampleAppDef` и учебный проект: тестовые входы разрешены.
        forbidden: testingForbidden,
        allowed: [...chatTestingAllowed, 'dmg-ui/example'],
        allowedPaths: [CHAT_UI_TESTING],
      },
      {
        include: [`${TG_BOT}/`],
        exclude: ['.test.ts'],
        forbidden,
        allowed: [
          'valibot',
          'dmg-core',
          'dmg-core/graph',
          'dmg-ui',
          'dmg-ui/server',
          'dmg-ui/graph',
          'dmg-ui/chat-ui',
        ],
        allowedPaths: [TG_BOT],
      },
      {
        include: [`${TG_BOT_TESTING}/`],
        exclude: ['.test.ts'],
        forbidden: testingForbidden,
        allowed: [...tgTestingAllowed, 'dmg-ui/example'],
        allowedPaths: [TG_BOT_TESTING],
      },
      {
        include: [`${BROWSER}/`],
        exclude: [],
        // Клиент DevTools и сценарии: среда, `bun:test`, тестовый вход `dmg-core`
        // и публичные входы пакета; сторонних библиотек нет. Из учебного проекта —
        // только сервер раннера web (клиент — код для DOM), код пакетов — по именам входов.
        forbidden: [],
        allowed: ['node:*', 'bun:*', 'dmg-core/testing', 'dmg-ui/*'],
        allowedPaths: [BROWSER, `${WEB_RUNNER}/server`],
      },
      {
        include: [`${ACCEPTANCE}/`],
        exclude: [],
        forbidden: [],
        forbiddenPaths: ['packages'],
        entriesOnly: {
          prefix: 'dmg-ui',
          names: Object.keys(manifest.entries()),
        },
      },
    ]);
  }

  /** Страж раскладки: файл пакета канала вне `src/` и `testing/` не попал бы ни в одну зону. */
  static scanLayout(files: SourceFile[]): Violation[] {
    return files.flatMap((file) => {
      const pkg = CHANNEL_PACKAGES.find((dir) =>
        file.path.startsWith(`${dir}/`),
      );
      if (!pkg) return [];
      const known = CHANNEL_DIRS.some((dir) =>
        file.path.startsWith(`${pkg}/${dir}/`),
      );
      return known
        ? []
        : [
            {
              file: file.path,
              line: 1,
              text: `файл вне известных каталогов ${CHANNEL_DIRS.map((d) => `${d}/`).join(', ')} пакета «${pkg}»: добавь зону в CoreImportScanner.standard`,
            },
          ];
    });
  }

  scan(files: SourceFile[]): Violation[] {
    const found: Violation[] = [];
    for (const file of files) {
      for (const zone of this.zones.filter((z) => this.inZone(z, file.path))) {
        for (const { specifier, line } of new ModuleSpecifiers(file).list()) {
          const reason = this.reason(zone, file.path, specifier);
          if (reason) found.push({ file: file.path, line, text: reason });
        }
      }
    }
    return found;
  }

  protected inZone(zone: ImportZone, path: string): boolean {
    return (
      zone.include.some((prefix) => this.under(prefix, path)) &&
      (zone.suffixes ?? ['']).some((suffix) => path.endsWith(suffix)) &&
      !zone.exclude.some((suffix) => path.endsWith(suffix)) &&
      !(zone.excludeDirs ?? []).some((dir) => path.startsWith(dir))
    );
  }

  /** Путь под префиксом зоны; сегмент `*` префикса — любой один сегмент пути. */
  protected under(prefix: string, path: string): boolean {
    if (!prefix.includes('*')) return path.startsWith(prefix);
    const parts = path.split('/');
    const segments = prefix.split('/');
    return segments.every((segment, i) => {
      const part = parts[i];
      if (part === undefined) return false;
      if (segment === '*') return true;
      return i === segments.length - 1
        ? part.startsWith(segment)
        : part === segment;
    });
  }

  protected reason(
    zone: ImportZone,
    path: string,
    specifier: string,
  ): string | undefined {
    if (specifier.startsWith('.')) {
      const target = posix.join(posix.dirname(path), specifier);
      const inside = (dir: string) =>
        target === dir || target.startsWith(`${dir}/`);
      const hit = (zone.forbiddenPaths ?? []).some(inside);
      const outside =
        zone.allowedPaths !== undefined && !zone.allowedPaths.some(inside);
      return hit || outside
        ? `запрещённый относительный импорт «${specifier}»`
        : undefined;
    }
    const closed = zone.entriesOnly;
    if (
      closed &&
      (specifier === closed.prefix ||
        specifier.startsWith(`${closed.prefix}/`)) &&
      !closed.names.includes(specifier)
    ) {
      return `импорт «${specifier}» — не имя входа из exports`;
    }
    if (this.matches(zone.forbidden, specifier)) {
      return `запрещённый импорт «${specifier}»`;
    }
    if (zone.allowed && !this.matches(zone.allowed, specifier)) {
      return `импорт «${specifier}» вне белого списка зоны`;
    }
    return undefined;
  }

  protected matches(patterns: string[], specifier: string): boolean {
    return patterns.some((pattern) =>
      pattern.endsWith('*')
        ? specifier.startsWith(pattern.slice(0, -1))
        : specifier === pattern,
    );
  }
}
