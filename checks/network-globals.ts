import type { SourceFile } from './source-tree';
import type { Violation } from './violation.types';

/**
 * Глобалы сети и среды (`fetch`, `WebSocket`, `XMLHttpRequest`, `EventSource`,
 * `Bun`, `process`) в `packages/tg-bot/src` без `.test.ts` (D-UI-61). Ловит
 * отдельное слово (в том числе в строках и комментариях), `globalThis['fetch']`,
 * деструктуризацию; не ловит `globalThis?.fetch`, псевдоним, склейку имени,
 * `Worker`, `sendBeacon`. Член объекта и часть имени — не нарушение.
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
