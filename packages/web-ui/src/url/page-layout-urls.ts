import { err, ok, type Result } from 'dmg-core';
import type { Address } from 'dmg-ui';
import type { PageLayoutParse } from './page-layout-urls.types';
import type { PageUrls } from './page-urls';
import {
  PAGE_URL_ASCII,
  PAGE_URL_LIMIT,
  PAGE_URL_NAME,
} from './page-urls.const';
import type { PageUrlRejection } from './page-urls.types';

export type { PageLayoutParse } from './page-layout-urls.types';

/**
 * Состав областей страницы в одной ссылке: основной адрес — как у `PageUrls`,
 * остальные области — вложенными URL под резервными ключами `_<область>`.
 * Ключи — замкнутый список `linked`: чужие метки (`_ga`) пропускаются.
 * Разбор не бросает; бросок — только на сборке с неверным списком.
 * @see ./page-layout-urls.test.ts
 */
export class PageLayoutUrls {
  private readonly keys = new Map<string, string>();

  /** Имя не по форме или повтор — ошибка программиста, бросок. */
  constructor(
    private readonly urls: PageUrls,
    private readonly linked: readonly string[],
  ) {
    for (const name of linked) {
      if (!PAGE_URL_NAME.test(name)) {
        throw new Error(`PageLayoutUrls: имя области ${name} не по форме`);
      }
      if (this.keys.has(name)) {
        throw new Error(`PageLayoutUrls: область ${name} названа дважды`);
      }
      this.keys.set(name, `_${name}`);
    }
  }

  /**
   * Свой URL — печатный ASCII, начинается ровно с одного `/`: `//` и `/\`
   * браузер читает как чужой хост, а табуляцию и перевод строки вырезает до
   * разбора. По инвариантам кодека чужого не бывает — страж на случай их
   * поломки (D-UI-81).
   */
  static own(url: string): boolean {
    return (
      PAGE_URL_ASCII.test(url) &&
      url.startsWith('/') &&
      url[1] !== '/' &&
      url[1] !== '\\'
    );
  }

  /**
   * Ссылка: основной адрес, затем области из `linked` по порядку. Область без
   * адреса, невыразимая, не своя или не влезшая в предел — пропущена, ссылка
   * целиком не отказывает; нет своего основного URL — `undefined`.
   */
  url(
    main: Address,
    regions: Readonly<Record<string, Address | undefined>>,
  ): string | undefined {
    const first = this.urls.url(main);
    if (first === undefined || !PageLayoutUrls.own(first)) return undefined;
    let url: string = first;
    for (const name of this.linked) {
      const address = regions[name];
      const nested = address === undefined ? undefined : this.urls.url(address);
      if (nested === undefined || !PageLayoutUrls.own(nested)) continue;
      const next = `${url}${url.includes('?') ? '&' : '?'}_${name}=${encodeURIComponent(nested)}`;
      if (next.length <= PAGE_URL_LIMIT) url = next;
    }
    return url;
  }

  /**
   * Разбор ссылки — внешние данные. Отказ основного адреса — отказ ссылки;
   * область: вложенный URL разбирается тем же `PageUrls.parse` один раз, с
   * резервным ключом внутри — `malformed` (вложенность одна).
   */
  parse(url: string): Result<PageLayoutParse, PageUrlRejection> {
    const main = this.urls.parse(url);
    if (!main.ok) return main;
    const pairs = this.urls.pairs(url);
    const regions: Record<string, Result<Address, PageUrlRejection>> = {};
    for (const [name, key] of this.keys) {
      const nested = pairs?.get(key);
      if (nested !== undefined) regions[name] = this.region(nested);
    }
    return ok({ main: main.value, regions });
  }

  /** Вложенный URL области: без своих резервных ключей, иначе — как основной. */
  private region(nested: string): Result<Address, PageUrlRejection> {
    const inner = this.urls.pairs(nested);
    if (inner !== undefined) {
      for (const key of this.keys.values()) {
        if (inner.has(key)) return err('malformed');
      }
    }
    return this.urls.parse(nested);
  }
}
