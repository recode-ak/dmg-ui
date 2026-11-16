import { builtinModules } from 'node:module';
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
          'dmg-core/gen',
          'dmg-core/cli',
        ],
      },
    ]);
  }

  scan(files: SourceFile[]): Violation[] {
    const found: Violation[] = [];
    for (const file of files) {
      for (const zone of this.zones.filter((z) => this.inZone(z, file.path))) {
        for (const { specifier, line } of new ModuleSpecifiers(file).list()) {
          if (this.isForbidden(zone, specifier)) {
            found.push({
              file: file.path,
              line,
              text: `запрещённый импорт «${specifier}»`,
            });
          }
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

  protected isForbidden(zone: ImportZone, specifier: string): boolean {
    return zone.forbidden.some((pattern) =>
      pattern.endsWith('*')
        ? specifier.startsWith(pattern.slice(0, -1))
        : specifier === pattern,
    );
  }
}
