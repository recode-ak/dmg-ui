import type { SourceFile } from './source-tree';
import type { Violation } from './violation.types';

/**
 * Глобалы `fetch`, `Bun`, `process` в `packages/tg-bot/src` без `.test.ts`.
 * Ловит отдельное слово (и в строках, комментариях), `globalThis['fetch']`,
 * деструктуризацию; не ловит `globalThis?.fetch`, псевдоним, склейку имени.
 *
 * @see D-UI-61, D-UI-111, `docs/reference/rules.md`
 */
export class NetworkGlobalScanner {
  protected static readonly ZONE = 'packages/tg-bot/src/';

  protected static readonly GLOBALS = new RegExp(
    [
      '(?:(?<=(?:globalThis|window|self)\\.)|(?<![\\p{L}\\p{N}_$.]))',
      '(?:fetch|Bun|process)',
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
