import { builtinModules } from 'node:module';
import { posix } from 'node:path';
import type { ImportZone } from './core-import-scanner.types';
import { ModuleSpecifiers } from './module-specifiers';
import type { SourceFile } from './source-tree';
import type { Violation } from './violation.types';

/** Проверка импортов ядра по набору зон: `node:`, `bun:`, встроенные модули и тестовые входы `dmg-core` запрещены. */
export class CoreImportScanner {
  constructor(protected readonly zones: ImportZone[]) {}

  /** Зоны репо: ядро (`packages/core/src`, кроме тестов) без платформенных и тестовых входов (TST-07). */
  static standard(): CoreImportScanner {
    return new CoreImportScanner([
      {
        include: ['packages/core/src/'],
        exclude: ['.test.ts'],
        forbidden: [
          'node:*',
          'bun:*',
          ...builtinModules,
          'dmg-core/testing',
          'dmg-core/testing/*',
          'dmg-ui/testing',
          'dmg-core/gen',
          'dmg-core/cli',
        ],
        allowed: [
          'valibot',
          'dmg-core',
          'dmg-core/graph',
          'dmg-core/app',
          'dmg-core/arch',
        ],
        forbiddenPaths: ['packages/core/testing'],
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
      !zone.exclude.some((suffix) => path.endsWith(suffix))
    );
  }

  protected reason(
    zone: ImportZone,
    path: string,
    specifier: string,
  ): string | undefined {
    if (specifier.startsWith('.')) {
      const target = posix.join(posix.dirname(path), specifier);
      const hit = (zone.forbiddenPaths ?? []).some(
        (dir) => target === dir || target.startsWith(`${dir}/`),
      );
      return hit
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
