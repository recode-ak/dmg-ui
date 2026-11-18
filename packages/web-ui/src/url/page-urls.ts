import { err, ok, type Result } from 'dmg-core';
import {
  type Address,
  AddressCodec,
  type AnyScreenDef,
  type AnyUiAppDef,
  UiIds,
} from 'dmg-ui';
import { PageParams } from './page-params';
import { PagePath } from './page-path';
import {
  PAGE_URL_ASCII,
  PAGE_URL_CONTROL,
  PAGE_URL_LIMIT,
  PAGE_URL_NAME,
} from './page-urls.const';
import type {
  PageRoute,
  PageUrlRejection,
  PageUrlRoute,
  PageUrlScreen,
  PageUrlsSpec,
} from './page-urls.types';

export type {
  PageRoute,
  PageUrlRejection,
  PageUrlsSpec,
} from './page-urls.types';

/**
 * Адрес `main` ↔ путь и строка запроса страницы (D-UI-76): путь — маршрут или
 * общий путь экрана `/<модуль>/<экран>`, прочие параметры — `имя=значение`.
 * Разбор не бросает, отказ — `Result` с причиной; сборка своего бросает только
 * на ошибке программиста, невыразимое — `undefined`.
 * @see ./page-urls.test.ts
 */
export class PageUrls {
  private readonly ids: UiIds;
  private readonly codec: AddressCodec;
  private readonly setName: string;
  /** Экраны набора по `id`. */
  private readonly screens = new Map<string, PageUrlScreen>();
  /** Маршруты в порядке объявления: первый совпавший решает. */
  private readonly routes: PageUrlRoute[] = [];

  /**
   * Маршрут на необъявленный вход, повтор пути, шаблоны, совпадающие на одном
   * URL, шаблон не по синтаксису, параметр пути не из экрана входа,
   * пересечение с общим путём, экран набора или его пример, не выражаемые
   * URL, — ошибка сборки, бросок.
   */
  constructor(spec: PageUrlsSpec) {
    const { app } = spec;
    this.ids = new UiIds(app.set);
    this.codec = new AddressCodec(app.set);
    this.setName = app.set.name;
    for (const module of app.set.modules) {
      for (const screen of module.screens) {
        this.claimScreen(module.name, screen);
      }
    }
    const paths = new Set<string>();
    for (const route of spec.routes) {
      this.claimRoute(app, route, paths);
    }
    for (const module of app.set.modules) {
      for (const screen of module.screens) {
        this.claimExamples(screen);
      }
    }
  }

  /**
   * URL своего адреса: первый маршрут экрана, который его выражает в
   * пределе длины, иначе общий путь экрана. Экран вне набора и значение не
   * того вида — бросок; знак, который не кодируется (одиночный суррогат) или
   * отвергается разбором (управляющий), и длина больше предела — `undefined`.
   */
  url(address: Address): string | undefined {
    const screen = this.screen(address.screen);
    const values = address.params as Readonly<Record<string, unknown>>;
    const encoded = this.encoded(screen, values);
    if (encoded === undefined) return undefined;
    for (const route of this.routes) {
      if (route.entry.screen !== address.screen) continue;
      const url = this.routed(route, values, encoded);
      if (url !== undefined && this.fits(url)) return url;
    }
    const url = `${screen.path}${this.search(encoded, [])}`;
    return this.fits(url) ? url : undefined;
  }

  /** Разбор URL страницы — внешние данные: адрес или причина отказа, без броска. */
  parse(url: string): Result<Address, PageUrlRejection> {
    // Длина — первой: дальше ни одного прохода по длинной строке.
    if (url.length > PAGE_URL_LIMIT) return err('tooLong');
    if (!PAGE_URL_ASCII.test(url) || url.includes('#') || !url.startsWith('/'))
      return err('malformed');
    const mark = url.indexOf('?');
    const segments = this.segments(mark < 0 ? url : url.slice(0, mark));
    const query = this.query(mark < 0 ? '' : url.slice(mark + 1));
    if (segments === undefined || query === undefined) return err('malformed');
    for (const route of this.routes) {
      const path = route.path.match(segments);
      if (path !== undefined)
        return this.address(route.screen, path, query, route.entry);
    }
    const [module, name] = segments;
    // Страховка на внешних данных: `id` экрана собирается строкой, и
    // декодированный сегмент со знаком `/` сдвинул бы его части. Поиск по
    // `Map` такое отвергает и сам, но `id` строится только из имён по форме.
    if (
      segments.length === 2 &&
      module !== undefined &&
      name !== undefined &&
      PAGE_URL_NAME.test(module) &&
      PAGE_URL_NAME.test(name)
    ) {
      const def = this.ids.findScreen(`${this.setName}/${module}/${name}`);
      if (def !== undefined) {
        return this.address(this.screen(def), new Map(), query, undefined);
      }
    }
    return err('unknownPath');
  }

  /**
   * Пары строки запроса URL — внешние данные, без броска: те же проверки
   * формы, что у `parse`, ключ и значение декодированы один раз. Отказ формы
   * или повтор ключа — `undefined`. Ключей, которых нет у экрана, не отсеивает.
   */
  pairs(url: string): ReadonlyMap<string, string> | undefined {
    if (url.length > PAGE_URL_LIMIT) return undefined;
    if (!PAGE_URL_ASCII.test(url) || url.includes('#') || !url.startsWith('/'))
      return undefined;
    const mark = url.indexOf('?');
    return this.query(mark < 0 ? '' : url.slice(mark + 1));
  }

  /** Экран набора: имена модуля и экрана — в общий путь, вид параметров — по схеме. */
  private claimScreen(module: string, def: AnyScreenDef): void {
    const id = this.ids.screen(def);
    const path = PagePath.common(id, module, def.name);
    if (!path.ok) throw new Error(`PageUrls: ${path.error}`);
    this.screens.set(id, {
      id,
      path: path.value,
      params: PageParams.of(id, def),
    });
  }

  /**
   * Маршрут: вход (только свой ключ `entries`, не член прототипа), повтор
   * пути, совпадение с прежним маршрутом на одном URL, параметры пути,
   * пересечение с общим путём экрана.
   */
  private claimRoute(
    app: AnyUiAppDef,
    route: PageRoute,
    paths: Set<string>,
  ): void {
    const entry = Object.hasOwn(app.entries, route.entry)
      ? app.entries[route.entry]
      : undefined;
    if (entry === undefined) {
      throw new Error(
        `PageUrls: маршрут ${route.path} ведёт на вход ${route.entry}, которого нет у приложения ${app.name}`,
      );
    }
    // Повтор пути — первым: частный случай совпадения со своим текстом.
    if (paths.has(route.path)) {
      throw new Error(`PageUrls: два маршрута с путём ${route.path}`);
    }
    paths.add(route.path);
    const path = PagePath.parse(route.path);
    const twin = this.routes.find((other) => other.path.overlaps(path));
    if (twin !== undefined) {
      throw new Error(
        `PageUrls: маршруты ${twin.path.path} и ${route.path} совпадают на одном URL — у URL было бы два смысла`,
      );
    }
    const screen = this.screen(entry.address.screen);
    for (const name of path.names()) {
      if (!screen.params.has(name)) {
        throw new Error(
          `PageUrls: параметр пути ${name} маршрута ${route.path} не объявлен экраном входа ${route.entry}`,
        );
      }
    }
    for (const other of this.screens.values()) {
      if (path.match(other.path.slice(1).split('/')) !== undefined) {
        throw new Error(
          `PageUrls: маршрут ${route.path} совпадает с общим путём экрана ${other.path}`,
        );
      }
    }
    this.routes.push({ path, entry: entry.address, screen });
  }

  /**
   * Примеры экрана: URL собран, и разбор вернул тот же адрес, иначе бросок с
   * `id`. Ловит то, чего не видит JSON Schema (`transform`). URL не собрался
   * по данным (`undefined`) или пример не по схеме — пропуск: второе ловит
   * правило графа UI-20; экран без примеров не проверяется (DEBT-UI-34).
   */
  private claimExamples(def: AnyScreenDef): void {
    const screen = this.screen(def);
    for (const [name, example] of Object.entries(def.examples)) {
      const decoded = this.codec.decode({
        screen: screen.id,
        params: example.params,
      });
      if (decoded.ok && !this.returns(decoded.value)) {
        throw new Error(
          `PageUrls: параметры экрана ${screen.id} не выражаются в URL: пример ${name} не проходит круг адрес → URL → адрес`,
        );
      }
    }
  }

  /**
   * Круг адреса: сборка бросила или разбор вернул не тот адрес — `false`;
   * URL не собрался по данным (`undefined`) — `true`, проверять нечего.
   */
  private returns(address: Address): boolean {
    let url: string | undefined;
    try {
      url = this.url(address);
    } catch {
      return false;
    }
    if (url === undefined) return true;
    const back = this.parse(url);
    return back.ok && this.same(address, back.value);
  }

  /** Один экран и те же значения объявленных параметров (`===`). */
  private same(left: Address, right: Address): boolean {
    if (left.screen !== right.screen) return false;
    const a = left.params as Readonly<Record<string, unknown>>;
    const b = right.params as Readonly<Record<string, unknown>>;
    return this.screen(left.screen)
      .params.names()
      .every((name) => a[name] === b[name]);
  }

  /** Экран набора по Def; вне набора — ошибка программиста, бросок `UiIds`. */
  private screen(def: AnyScreenDef): PageUrlScreen {
    const id = this.ids.screen(def);
    const screen = this.screens.get(id);
    if (screen === undefined) throw new Error(`PageUrls: экрана ${id} нет`);
    return screen;
  }

  /**
   * Закодированные тексты параметров своего адреса в порядке схемы, без
   * `undefined`. Вид проверяется у всех до кодирования: бросок не прячется
   * за `undefined`. Управляющий знак — `undefined`: разбор его отвергает.
   */
  private encoded(
    screen: PageUrlScreen,
    values: Readonly<Record<string, unknown>>,
  ): ReadonlyMap<string, string> | undefined {
    const texts: [string, string][] = [];
    for (const name of screen.params.names()) {
      const value = values[name];
      if (value !== undefined) {
        texts.push([name, screen.params.text(name, value)]);
      }
    }
    const encoded = new Map<string, string>();
    for (const [name, text] of texts) {
      // Сборка и разбор отвергают одно множество знаков: круг сходится.
      if (PAGE_URL_CONTROL.test(text)) return undefined;
      try {
        encoded.set(name, encodeURIComponent(text));
      } catch {
        // Одиночный суррогат: данные, а не программа.
        return undefined;
      }
    }
    return encoded;
  }

  /**
   * URL по маршруту или `undefined`, если маршрут адрес не выражает. Без
   * параметров пути: адрес входа — голый путь; иначе — строка запроса, а
   * адрес без значений при непустом входе маршрутом не выражается: голый путь
   * разбирается в адрес входа.
   */
  private routed(
    route: PageUrlRoute,
    values: Readonly<Record<string, unknown>>,
    encoded: ReadonlyMap<string, string>,
  ): string | undefined {
    const names = route.path.names();
    if (names.length === 0) {
      const entry = route.entry.params as Readonly<Record<string, unknown>>;
      const same = route.screen.params
        .names()
        .every((name) => entry[name] === values[name]);
      if (same) return route.path.path;
      if (encoded.size === 0) return undefined;
      return `${route.path.path}${this.search(encoded, names)}`;
    }
    const path = route.path.fill(encoded);
    return path === undefined
      ? undefined
      : `${path}${this.search(encoded, names)}`;
  }

  /** Строка запроса из параметров вне пути; нет таких — пусто. */
  private search(
    encoded: ReadonlyMap<string, string>,
    skip: readonly string[],
  ): string {
    const pairs: string[] = [];
    for (const [name, text] of encoded) {
      if (!skip.includes(name)) pairs.push(`${name}=${text}`);
    }
    return pairs.length === 0 ? '' : `?${pairs.join('&')}`;
  }

  /** Свой URL в пределе длины. */
  private fits(url: string): boolean {
    return url.length <= PAGE_URL_LIMIT;
  }

  /**
   * Сегменты пути, каждый декодирован один раз; `/` — ноль сегментов. Пустой
   * сегмент, сбой декодирования, `.`, `..`, управляющий знак — `undefined`.
   */
  private segments(raw: string): readonly string[] | undefined {
    if (raw === '/') return [];
    const segments: string[] = [];
    for (const part of raw.slice(1).split('/')) {
      const segment = part === '' ? undefined : this.decoded(part);
      if (segment === undefined || segment === '.' || segment === '..')
        return undefined;
      segments.push(segment);
    }
    return segments;
  }

  /**
   * Пары строки запроса по `&`, ключ и значение декодированы один раз.
   * Пустая пара, пара без `=` или с пустым ключом, сбой декодирования,
   * управляющий знак, повтор ключа — `undefined`. `+` — знак `+`, не пробел.
   */
  private query(raw: string): ReadonlyMap<string, string> | undefined {
    const pairs = new Map<string, string>();
    if (raw === '') return pairs;
    for (const pair of raw.split('&')) {
      const mark = pair.indexOf('=');
      if (mark <= 0) return undefined;
      const key = this.decoded(pair.slice(0, mark));
      const value = this.decoded(pair.slice(mark + 1));
      if (key === undefined || value === undefined || pairs.has(key))
        return undefined;
      pairs.set(key, value);
    }
    return pairs;
  }

  /** Одно декодирование без броска; сбой или управляющий знак — `undefined`. */
  private decoded(raw: string): string | undefined {
    let text: string;
    try {
      text = decodeURIComponent(raw);
    } catch {
      return undefined;
    }
    return PAGE_URL_CONTROL.test(text) ? undefined : text;
  }

  /**
   * Адрес экрана из текстов пути и запроса. Ни одного объявленного параметра
   * у маршрута — ровно адрес входа; иначе адрес строится только из URL.
   * Объект параметров — только из объявленных имён: ключ запроса, которого
   * экран не объявил, пропускается и ключом объекта не становится.
   */
  private address(
    screen: PageUrlScreen,
    path: ReadonlyMap<string, string>,
    query: ReadonlyMap<string, string>,
    entry: Address | undefined,
  ): Result<Address, PageUrlRejection> {
    for (const name of path.keys()) {
      if (query.has(name)) return err('malformed');
    }
    const declared = screen.params
      .names()
      .filter((name) => path.has(name) || query.has(name));
    if (entry !== undefined && declared.length === 0) return ok(entry);
    const params: [string, unknown][] = [];
    for (const name of declared) {
      const text = path.get(name) ?? query.get(name);
      if (text === undefined) continue;
      const value = screen.params.value(name, text);
      if (!value.ok) return err('invalidParams');
      params.push([name, value.value]);
    }
    const decoded = this.codec.decode({
      screen: screen.id,
      params: Object.fromEntries(params),
    });
    return decoded.ok ? ok(decoded.value) : err('invalidParams');
  }
}
