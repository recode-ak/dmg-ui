import type { SourceFile } from './source-tree';
import type { Violation } from './violation.types';

const NAME = '[\\p{L}\\p{N}_$]';
/** Не часть имени и не член объекта: перед словом нет буквы, цифры, `_`, `$`, `.`. */
const STANDALONE = `(?<!${NAME}|\\.)`;
const END = `(?!${NAME})`;
/** Имена API браузера, которые ловятся и как член `globalThis` или `self`, и по ключу. */
const API =
  'WebSocket|XMLHttpRequest|EventSource|localStorage|sessionStorage|navigator|indexedDB|BroadcastChannel|HTMLElement|requestAnimationFrame|addEventListener';
const ROOT_MEMBERS = `${API}|window|document|location|history`;
const KEY = (names: string) => `\\[\\s*['"\`](?:${names})['"\`]\\s*\\]`;

/**
 * Глобалы браузера и среды. Первая проверка: API браузера в `packages/**` и
 * `examples/**` без `.test.ts`, кроме двух адаптеров клиента страничного
 * пакета (`page-browser-socket.ts` и `page-history.types.ts` с формой окна
 * браузера в `packages/web-ui/src/client/`) и клиента примера для браузера
 * (`examples/web/src/client/`): остальной клиент пакета, провод, кодек адреса
 * и представления получают среду аргументом (окно приходит в
 * `PageBrowserHistory` параметром), серверу и моделям представлений примера
 * браузер не нужен, остальной код работает и на сервере. Голые `window`,
 * `document`, `history`, `location` встречаются в обычном коде (`'window'` в
 * схемах, свойство `history`), поэтому они ловятся по форме использования:
 * `window.<член>`, `document.createElement`, `history.pushState`,
 * `location.href`, `globalThis.window`, `self.document`,
 * `window['document']`, `{ … } = window`. Вторая проверка: `Bun` и `process`
 * во всём `packages/web-ui/src/` без `.test.ts` — сервер говорит с
 * соединением через порт, клиент выполняется в браузере. `fetch` не ловится:
 * в `tg-bot` его закрывает `NetworkGlobalScanner`, клиенту он понадобится. Не
 * ловит: члены `document` вне списка, алиасы (`const w = window`),
 * вычисляемые ключи (`window[name]`); комментарий с `window.x` вне
 * разрешённых файлов считается нарушением. Член объекта, часть имени и строка
 * в литерале — не нарушение.
 */
export class BrowserGlobalScanner {
  protected static readonly BROWSER_ZONES = ['packages/', 'examples/'];
  /** Клиент примера для браузера: DOM и сокет — его работа. */
  protected static readonly BROWSER_ALLOWED = ['examples/web/src/client/'];
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
      `${STANDALONE}window\\.${NAME}+`,
      `${STANDALONE}document\\.(?:createElement|createTextNode|getElementById|querySelector(?:All)?|body|documentElement|cookie|title|addEventListener)${END}`,
      `${STANDALONE}history\\.(?:pushState|replaceState|back|forward|go|state|scrollRestoration)${END}`,
      `${STANDALONE}location\\.(?:href|pathname|search|hash|origin|host|hostname|assign|replace|reload)${END}`,
      `${STANDALONE}(?:globalThis|self)\\.(?:${ROOT_MEMBERS})${END}`,
      `${STANDALONE}(?:window|globalThis|self)${KEY(ROOT_MEMBERS)}`,
      `${STANDALONE}\\{[^}]*\\}\\s*=\\s*(?:window|globalThis)(?![\\p{L}\\p{N}_$.])`,
      `${STANDALONE}\\{[^}]*(?<!${NAME})(?:${ROOT_MEMBERS})(?!${NAME})[^}]*\\}\\s*=\\s*self(?![\\p{L}\\p{N}_$.])`,
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
