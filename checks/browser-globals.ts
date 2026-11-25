import type { SourceFile } from './source-tree';
import type { Violation } from './violation.types';

const NAME = '[\\p{L}\\p{N}_$]';
/** Не часть имени и не член объекта: перед словом нет буквы, цифры, `_`, `$`, `.`. */
const STANDALONE = `(?<!${NAME}|\\.)`;
const END = `(?!${NAME})`;
/**
 * Имена API браузера, которых не видит `tsc` (типы Bun их объявляют).
 * Имена с DOM-типами отвергает `tsc` корневой программы: `tsconfig.test.ts`.
 */
const API =
  'WebSocket|EventSource|localStorage|sessionStorage|navigator|BroadcastChannel|addEventListener';
const KEY = (names: string) => `\\[\\s*['"\`](?:${names})['"\`]\\s*\\]`;

/**
 * Глобалы браузера и среды: API браузера, которых не видит `tsc`, вне
 * адаптеров клиента и DOM-клиента учебного проекта; `Bun` и `process` в `web-ui/src`. Голое
 * имя ловит и ключ `globalThis['…']`, и деструктуризацию; член (`globalThis.x`)
 * — отдельной альтернативой. Не ловит: `globalThis?.x`, `(globalThis as any).x`,
 * алиасы, вычисляемые ключи. Строка и комментарий с именем — нарушение.
 *
 * @see D-UI-111, `docs/reference/rules.md`
 */
export class BrowserGlobalScanner {
  protected static readonly BROWSER_ZONES = ['packages/'];
  /** DOM-клиент раннера web учебного проекта: DOM и сокет — его работа. */
  protected static readonly BROWSER_ALLOWED = [
    'packages/example/src/runners/web/client/',
  ];
  /**
   * Клиент страничного пакета получает среду аргументом: страница однажды
   * сможет работать и на сервере. Браузер трогают только адаптеры.
   */
  static readonly BROWSER_ADAPTERS = [
    'packages/web-ui/src/client/page-browser-socket.ts',
    'packages/web-ui/src/client/page-history.types.ts',
  ];
  protected static readonly ENV_ZONE = 'packages/web-ui/src/';

  protected static readonly BROWSER = new RegExp(
    [
      `${STANDALONE}(?:${API})${END}`,
      `${STANDALONE}globalThis\\.(?:${API})${END}`,
    ].join('|'),
    'gu',
  );

  protected static readonly ENV = new RegExp(
    [
      `${STANDALONE}(?:Bun|process)${END}`,
      `${STANDALONE}globalThis\\.(?:Bun|process)${END}`,
      `${STANDALONE}globalThis${KEY('Bun|process')}`,
    ].join('|'),
    'gu',
  );

  scan(files: SourceFile[]): Violation[] {
    const found: Violation[] = [];
    for (const file of files) {
      if (file.path.endsWith('.test.ts')) continue;
      if (BrowserGlobalScanner.inBrowserZone(file.path)) {
        found.push(...this.match(file, BrowserGlobalScanner.BROWSER));
      }
      if (file.path.startsWith(BrowserGlobalScanner.ENV_ZONE)) {
        found.push(...this.match(file, BrowserGlobalScanner.ENV));
      }
    }
    return found;
  }

  protected match(file: SourceFile, pattern: RegExp): Violation[] {
    const found: Violation[] = [];
    file.lines().forEach((text, index) => {
      for (const match of text.matchAll(pattern)) {
        found.push({ file: file.path, line: index + 1, text: match[0] });
      }
    });
    return found;
  }

  protected static inBrowserZone(path: string): boolean {
    return (
      BrowserGlobalScanner.BROWSER_ZONES.some((zone) =>
        path.startsWith(zone),
      ) &&
      !BrowserGlobalScanner.BROWSER_ALLOWED.some((dir) =>
        path.startsWith(dir),
      ) &&
      !BrowserGlobalScanner.BROWSER_ADAPTERS.includes(path)
    );
  }
}
