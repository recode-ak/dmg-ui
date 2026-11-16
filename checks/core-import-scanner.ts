import { builtinModules } from 'node:module';
import { posix } from 'node:path';
import type { ImportZone } from './core-import-scanner.types';
import { ModuleSpecifiers } from './module-specifiers';
import type { SourceFile } from './source-tree';
import type { Violation } from './violation.types';

/** Учебный пример (критерий 2): код и манифесты — как у проекта. */
const EXAMPLE = 'packages/core/testing/example';
/** Привязка примера к каналу: представления и граф примера. */
const BINDING = 'packages/core/testing/example/dialog';
/** Учебный диалоговый канал. */
const CHANNEL = 'packages/core/testing/dialog';
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
   * канала, ARC-08) и помощник рендера (`testing/preview/`: как канал, без
   * сервера и графа).
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
        excludeDirs: [`${BINDING}/`],
        // Без `dmg-core/testing/*` из общего списка: контракты учебного
        // приложения (`dmg-core/testing/example`) примеру разрешены.
        forbidden: forbidden.filter((spec) => spec !== 'dmg-core/testing/*'),
        allowed: ['valibot', 'dmg-core', 'dmg-ui', 'dmg-core/testing/example'],
        allowedPaths: [EXAMPLE],
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
