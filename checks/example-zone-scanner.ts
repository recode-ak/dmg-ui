import { ModuleSpecifiers } from './module-specifiers';
import type { SourceFile } from './source-tree';
import type { Violation } from './violation.types';

/**
 * Зона учебного проекта `packages/example`: `grammy` и `@grammyjs/*` — только в
 * адаптере раннера `tg-bot` (`runners/tg-bot/grammy-*.ts`, его `*.test.ts` и
 * `*.types.ts`); адаптер по относительному пути берут `main.ts`, `probe.ts`,
 * тесты и он сам; абсолютных путей в импортах нет. Выход относительным путём
 * держат `PackageDirections` (из пакета) и слои (из места). `import(переменная)`
 * не ловится (DEBT-UI-5).
 *
 * @see D-UI-68, D-UI-111, `docs/reference/rules.md`
 */
export class ExampleZoneScanner {
  protected static readonly ZONES = 'packages/example';

  protected static readonly ADAPTER_DIR =
    'packages/example/src/runners/tg-bot/';

  /** Файл адаптера: `grammy-*.ts` в каталоге адаптера, его `*.test.ts` и `*.types.ts` тоже. */
  protected static readonly ADAPTER_FILE = /^grammy-[^/]+\.ts$/;

  /** Модуль адаптера в спецификаторе: `./grammy-*` без расширения и с `.ts`. */
  protected static readonly ADAPTER_MODULE = /^grammy-[^/]+$/;

  protected static readonly ADAPTER_CLIENTS = ['main.ts', 'probe.ts'];

  protected static readonly LIBRARY = /^(?:grammy(?:\/.*)?|@grammyjs\/.*)$/;

  scan(files: SourceFile[]): Violation[] {
    const found: Violation[] = [];
    for (const file of files) {
      for (const { specifier, line } of new ModuleSpecifiers(file).list()) {
        const text = this.violation(file.path, specifier);
        if (text) found.push({ file: file.path, line, text });
      }
    }
    return found;
  }

  protected violation(path: string, specifier: string): string | undefined {
    if (
      ExampleZoneScanner.LIBRARY.test(specifier) &&
      !ExampleZoneScanner.isAdapter(path)
    ) {
      return `${specifier}: библиотека Telegram разрешена только в адаптере и опросе примера`;
    }
    if (ExampleZoneScanner.reachesAdapter(path, specifier)) {
      return `${specifier}: адаптер библиотеки берут только main.ts, probe.ts и тесты`;
    }
    if (ExampleZoneScanner.inZone(path) && specifier.startsWith('/')) {
      return `${specifier}: абсолютный путь в учебном проекте — только относительные пути и имена входов`;
    }
    return undefined;
  }

  protected static isAdapter(path: string): boolean {
    return (
      path.startsWith(ExampleZoneScanner.ADAPTER_DIR) &&
      ExampleZoneScanner.ADAPTER_FILE.test(
        path.slice(ExampleZoneScanner.ADAPTER_DIR.length),
      )
    );
  }

  protected static reachesAdapter(path: string, specifier: string): boolean {
    const name = specifier.replace(/^\.\//, '').replace(/\.ts$/, '');
    if (!ExampleZoneScanner.ADAPTER_MODULE.test(name)) return false;
    if (!ExampleZoneScanner.inZone(path) || !specifier.startsWith('./')) {
      return false;
    }
    const file = path.slice(path.lastIndexOf('/') + 1);
    return !(
      ExampleZoneScanner.isAdapter(path) ||
      ExampleZoneScanner.ADAPTER_CLIENTS.includes(file) ||
      file.endsWith('.test.ts')
    );
  }

  protected static inZone(path: string): boolean {
    return path.startsWith(`${ExampleZoneScanner.ZONES}/`);
  }
}
