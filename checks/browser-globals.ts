import type { SourceFile } from './source-tree';
import type { Violation } from './violation.types';

const NAME = '[\\p{L}\\p{N}_$]';
/** Не часть имени и не член объекта: перед словом нет буквы, цифры, `_`, `$`, `.`. */
const STANDALONE = `(?<!${NAME}|\\.)`;
const END = `(?!${NAME})`;

/**
 * Глобалы браузера и среды. Первая проверка: API браузера в `packages/**` и
 * `examples/**` без `.test.ts`, кроме клиента страничного пакета
 * (`packages/web-ui/src/client/`) и примера для браузера (`examples/web/`):
 * остальной код работает и на сервере. Голые `window`, `document`, `history`,
 * `location` встречаются в обычном коде (`'window'` в схемах, свойство
 * `history`), поэтому они ловятся по форме использования: `window.<член>`,
 * `document.createElement`, `history.pushState`, `location.href`,
 * `globalThis.window`, `{ … } = window`. Вторая проверка: `Bun` и `process` во
 * всём `packages/web-ui/src/` без `.test.ts` — сервер говорит с соединением
 * через порт, клиент выполняется в браузере. `fetch` не ловится: в `tg-bot`
 * его закрывает `NetworkGlobalScanner`, клиенту он понадобится. Член объекта,
 * часть имени и строка в литерале — не нарушение.
 */
export class BrowserGlobalScanner {
  protected static readonly BROWSER_ZONES = ['packages/', 'examples/'];
  protected static readonly BROWSER_ALLOWED = [
    'packages/web-ui/src/client/',
    'examples/web/',
  ];
  protected static readonly ENV_ZONE = 'packages/web-ui/src/';

  protected static readonly BROWSER = new RegExp(
    [
      `${STANDALONE}(?:WebSocket|XMLHttpRequest|EventSource|localStorage|sessionStorage|navigator|indexedDB|BroadcastChannel|HTMLElement|requestAnimationFrame|addEventListener)${END}`,
      `${STANDALONE}window\\.${NAME}+`,
      `${STANDALONE}document\\.(?:createElement|createTextNode|getElementById|querySelector(?:All)?|body|documentElement|cookie|title|addEventListener)${END}`,
      `${STANDALONE}history\\.(?:pushState|replaceState|back|forward|go|state|scrollRestoration)${END}`,
      `${STANDALONE}location\\.(?:href|pathname|search|hash|origin|host|hostname|assign|replace|reload)${END}`,
      `${STANDALONE}globalThis\\.(?:window|document|location|history)${END}`,
      `${STANDALONE}\\{[^}]*\\}\\s*=\\s*(?:window|globalThis)${END}`,
    ].join('|'),
    'gu',
  );

  protected static readonly ENV = new RegExp(
    `${STANDALONE}(?:Bun|process)${END}`,
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
      !BrowserGlobalScanner.BROWSER_ALLOWED.some((dir) => path.startsWith(dir))
    );
  }
}
