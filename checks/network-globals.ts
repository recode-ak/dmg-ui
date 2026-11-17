import type { SourceFile } from './source-tree';
import type { Violation } from './violation.types';

/**
 * Поиск глобалов сети и среды (`fetch`, `WebSocket`, `XMLHttpRequest`,
 * `EventSource`, `Bun`, `process`) в коде пакета Telegram
 * (`packages/tg-bot/src`, кроме `.test.ts`): сеть и библиотеку даёт проект
 * через порт Bot API. Импорт закрывает сканер импортов, глобал импортом не
 * ловится. Нарушение — отдельный идентификатор или доступ через
 * `globalThis`, `window`, `self`; член объекта (`this.api.fetch`) и часть
 * имени (`prefetch`, `WebSocketLike`) — нет. Текст режется построчно,
 * комментарии и строки тоже проверяются.
 */
export class NetworkGlobalScanner {
  protected static readonly ZONE = 'packages/tg-bot/src/';

  protected static readonly GLOBALS = new RegExp(
    [
      '(?:(?<=(?:globalThis|window|self)\\.)|(?<![\\p{L}\\p{N}_$.]))',
      '(?:fetch|WebSocket|XMLHttpRequest|EventSource|Bun|process)',
      '(?![\\p{L}\\p{N}_$])',
    ].join(''),
    'gu',
  );

  scan(files: SourceFile[]): Violation[] {
    const found: Violation[] = [];
    for (const file of files) {
      if (!NetworkGlobalScanner.inZone(file.path)) continue;
      file.lines().forEach((text, index) => {
        for (const match of text.matchAll(NetworkGlobalScanner.GLOBALS)) {
          found.push({ file: file.path, line: index + 1, text: match[0] });
        }
      });
    }
    return found;
  }

  protected static inZone(path: string): boolean {
    return (
      path.startsWith(NetworkGlobalScanner.ZONE) && !path.endsWith('.test.ts')
    );
  }
}
