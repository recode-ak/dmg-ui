import { dirname, join, normalize } from 'node:path/posix';
import { ModuleSpecifiers } from './module-specifiers';
import type { SourceFile } from './source-tree';
import type { Violation } from './violation.types';

/**
 * Зона примера `examples/tg-bot`: библиотека Telegram (имя `grammy` и
 * её подпути, `@grammyjs/*`) видна только двум файлам адаптера примера и их
 * тестам; из файлов примера нельзя выйти относительным импортом за каталог
 * `examples/tg-bot` (соседей берут по именам входов пакета). Нарушение — на
 * каждый спецификатор. Спецификаторы ищет `ModuleSpecifiers`, поэтому динамический
 * `import(переменная)` и склейка имени не ловятся (DEBT-UI-5). Остальные места
 * репо (`packages`, `checks`, `acceptance`, `scripts`) сканер не ограничивает,
 * кроме запрета библиотеки; из запрета исключены тесты `CoreImportScanner`
 * (`checks/core-import-scanner*.test.ts`): имя библиотеки там — строка-фикстура.
 */
export class ExampleZoneScanner {
  protected static readonly ZONE = 'examples/tg-bot';

  protected static readonly ADAPTER_DIR = 'examples/tg-bot/src/';

  protected static readonly ADAPTER_FILES = [
    'grammy-bot-api.ts',
    'grammy-bot-api.test.ts',
    'grammy-polling.ts',
    'grammy-polling.test.ts',
  ];

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
      !ExampleZoneScanner.isAdapter(path) &&
      !ExampleZoneScanner.isFixtureHolder(path)
    ) {
      return `${specifier}: библиотека Telegram разрешена только в адаптере и опросе примера`;
    }
    if (
      ExampleZoneScanner.inZone(path) &&
      specifier.startsWith('.') &&
      !ExampleZoneScanner.staysInZone(path, specifier)
    ) {
      return `${specifier}: пример не выходит за каталог ${ExampleZoneScanner.ZONE}`;
    }
    return undefined;
  }

  protected static isAdapter(path: string): boolean {
    return (
      path.startsWith(ExampleZoneScanner.ADAPTER_DIR) &&
      ExampleZoneScanner.ADAPTER_FILES.includes(
        path.slice(ExampleZoneScanner.ADAPTER_DIR.length),
      )
    );
  }

  /** Тесты `CoreImportScanner` держат имя библиотеки в строках-фикстурах: это текст проверяемого файла, не импорт. */
  protected static isFixtureHolder(path: string): boolean {
    return (
      path.startsWith('checks/core-import-scanner') && path.endsWith('.test.ts')
    );
  }

  protected static inZone(path: string): boolean {
    return path.startsWith(`${ExampleZoneScanner.ZONE}/`);
  }

  protected static staysInZone(path: string, specifier: string): boolean {
    const target = normalize(join(dirname(path), specifier));
    return target.startsWith(`${ExampleZoneScanner.ZONE}/`);
  }
}
