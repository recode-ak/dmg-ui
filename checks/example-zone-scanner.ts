import { dirname, join, normalize } from 'node:path/posix';
import { ModuleSpecifiers } from './module-specifiers';
import type { SourceFile } from './source-tree';
import type { Violation } from './violation.types';

/**
 * Зона примеров `examples/*`: `grammy` и `@grammyjs/*` — только в адаптере
 * `examples/tg-bot/src/grammy-*.ts` (и его `*.test.ts`, `*.types.ts`); адаптер
 * по относительному пути берут `main.ts`, `probe.ts`, тесты и он сам; из примера
 * не выйти за его каталог. `import(переменная)` не ловится (DEBT-UI-5).
 *
 * @see D-UI-68, D-UI-111, `docs/reference/rules.md`
 */
export class ExampleZoneScanner {
  protected static readonly ZONES = 'examples';

  protected static readonly ADAPTER_DIR = 'examples/tg-bot/src/';

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
    if (ExampleZoneScanner.inZone(path) && !this.staysInZone(path, specifier)) {
      return `${specifier}: пример не выходит за свой каталог ${ExampleZoneScanner.ZONES}/<пример>`;
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

  /** Каталог примера — второй сегмент пути; абсолютный и выходящий за него путь не остаётся в зоне. */
  protected staysInZone(path: string, specifier: string): boolean {
    if (specifier.startsWith('/')) return false;
    if (!specifier.startsWith('.')) return true;
    const home = path.split('/').slice(0, 2).join('/');
    const target = normalize(join(dirname(path), specifier));
    return target.startsWith(`${home}/`);
  }
}
