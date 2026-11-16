import { builtinModules } from 'node:module';
import { posix } from 'node:path';
import type { ImportZone } from './core-import-scanner.types';
import { ModuleSpecifiers } from './module-specifiers';
import type { SourceFile } from './source-tree';
import type { Violation } from './violation.types';

/** Учебный пример: код и манифесты — как у проекта. */
const EXAMPLE = 'packages/core/testing/example';
/** Привязка примера к каналу: представления и граф примера. */
const BINDING = 'packages/core/testing/example/dialog';
/** Учебный диалоговый канал. */
const CHANNEL = 'packages/core/testing/dialog';
/** Привязка примера к страничному каналу: представления, маршруты и граф примера. */
const PAGES_BINDING = 'packages/core/testing/example/pages';
/** Учебный страничный канал: подкаталоги разделены границей JSON. */
const PAGE = 'packages/core/testing/page';
const PAGE_CLIENT = `${PAGE}/client`;
const PAGE_SERVER = `${PAGE}/server`;
const PAGE_WIRE = `${PAGE}/wire`;
const PAGE_GRAPH = `${PAGE}/graph`;
/** Помощник рендера примеров: от канала и сервера не зависит. */
const PREVIEW = 'packages/core/testing/preview';

/** Проверка импортов ядра по набору зон: `node:`, `bun:`, встроенные модули и тестовые входы `dmg-core` запрещены. */
export class CoreImportScanner {
  constructor(protected readonly zones: ImportZone[]) {}

  /**
   * Зоны репо (TST-07): ядро (`packages/core/src`, кроме тестов, `graph/` и
   * `server/`), граф (`src/graph`, где разрешён `dmg-core/graph`), сервер
   * (`src/server`: плюс `dmg-core/app` и `/graph`, без `graph/` ядра),
   * учебный пример (`testing/example/`, кроме `dialog/`: только `valibot`,
   * `dmg-core`, `dmg-ui` и контракты учебного приложения — как у проекта;
   * относительные — внутри `example/`) и привязка примера к каналу
   * (`testing/example/dialog/`: плюс граф и сборка `ArchApp`; относительные —
   * в `example/` и учебный канал `testing/dialog/`), учебный канал
   * (`testing/dialog/`: только публичные входы `dmg-ui`, `dmg-ui/server`,
   * `dmg-ui/graph`, `dmg-core`, `dmg-core/graph`; относительные — внутри
   * канала, ARC-08), помощник рендера (`testing/preview/`: как канал, без
   * сервера и графа), страничный канал (`testing/page/`: у `client/`, `wire/`,
   * `server/`, `graph/` и корня свои белые списки, клиент не знает сервер и
   * граф, сервер не знает клиент) и привязка примера к нему
   * (`testing/example/pages/`, как у диалога; привязки друг друга не знают).
   */
  static standard(): CoreImportScanner {
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
        include: [`${EXAMPLE}/`],
        exclude: ['.test.ts'],
        excludeDirs: [`${BINDING}/`, `${PAGES_BINDING}/`],
        // Без `dmg-core/testing/*` из общего списка: контракты учебного
        // приложения (`dmg-core/testing/example`) примеру разрешены.
        forbidden: forbidden.filter((spec) => spec !== 'dmg-core/testing/*'),
        allowed: ['valibot', 'dmg-core', 'dmg-ui', 'dmg-core/testing/example'],
        allowedPaths: [EXAMPLE],
        // Привязка лежит внутри `example/`, но пример её не знает: через неё
        // пример дотянулся бы до канала, сервера и графа.
        forbiddenPaths: [BINDING, PAGES_BINDING],
      },
      {
        include: [`${BINDING}/`],
        exclude: ['.test.ts'],
        // Сборке `ExampleDialogArch` нужен `ExampleArch` из `dmg-core/testing`.
        forbidden: forbidden.filter(
          (spec) =>
            spec !== 'dmg-core/testing/*' && spec !== 'dmg-core/testing',
        ),
        allowed: [
          'valibot',
          'dmg-core',
          'dmg-core/graph',
          'dmg-core/arch',
          'dmg-core/testing',
          'dmg-core/testing/example',
          'dmg-ui',
          'dmg-ui/graph',
        ],
        allowedPaths: [EXAMPLE, CHANNEL],
        // Привязки каналов не знают друг друга: `EXAMPLE` в списке выше
        // охватывает и соседнюю привязку.
        forbiddenPaths: [PAGES_BINDING],
      },
      {
        include: [`${PAGES_BINDING}/`],
        exclude: ['.test.ts'],
        // Как у привязки диалога: сборке `ExamplePagesArch` нужен `ExampleArch`.
        forbidden: forbidden.filter(
          (spec) =>
            spec !== 'dmg-core/testing/*' && spec !== 'dmg-core/testing',
        ),
        allowed: [
          'valibot',
          'dmg-core',
          'dmg-core/graph',
          'dmg-core/arch',
          'dmg-core/testing',
          'dmg-core/testing/example',
          'dmg-ui',
          'dmg-ui/graph',
        ],
        allowedPaths: [EXAMPLE, PAGE],
        forbiddenPaths: [BINDING],
      },
      {
        include: [`${PAGE_CLIENT}/`],
        exclude: ['.test.ts'],
        forbidden,
        allowed: ['valibot', 'dmg-core', 'dmg-ui'],
        // Имя канала — для проверки приложения при сборке вкладки.
        allowedPaths: [PAGE_CLIENT, PAGE_WIRE, `${PAGE}/page-channel.const`],
      },
      {
        include: [`${PAGE_WIRE}/`],
        exclude: ['.test.ts'],
        forbidden,
        allowed: ['valibot', 'dmg-core', 'dmg-ui'],
        allowedPaths: [PAGE_WIRE],
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
        // Имя канала и версию поставщика граф берёт из `page-channel.const`.
        allowedPaths: [PAGE_GRAPH, PAGE_CLIENT, `${PAGE}/page-channel.const`],
      },
      {
        include: [`${PAGE}/`],
        exclude: ['.test.ts'],
        // Корень канала — файлы `page/*.ts`; подкаталоги имеют свои зоны.
        excludeDirs: [
          `${PAGE_CLIENT}/`,
          `${PAGE_SERVER}/`,
          `${PAGE_WIRE}/`,
          `${PAGE_GRAPH}/`,
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
        include: [`${CHANNEL}/`],
        exclude: ['.test.ts'],
        forbidden,
        allowed: [
          'valibot',
          'dmg-core',
          'dmg-core/graph',
          'dmg-ui',
          'dmg-ui/server',
          'dmg-ui/graph',
        ],
        allowedPaths: [CHANNEL],
      },
      {
        include: [`${PREVIEW}/`],
        exclude: ['.test.ts'],
        forbidden,
        allowed: ['valibot', 'dmg-core', 'dmg-ui'],
        allowedPaths: [PREVIEW],
      },
    ]);
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
      zone.include.some((prefix) => path.startsWith(prefix)) &&
      (zone.suffixes ?? ['']).some((suffix) => path.endsWith(suffix)) &&
      !zone.exclude.some((suffix) => path.endsWith(suffix)) &&
      !(zone.excludeDirs ?? []).some((dir) => path.startsWith(dir))
    );
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
