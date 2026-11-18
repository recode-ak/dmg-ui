import type { UiIds } from 'dmg-ui';
import { PAGE_REGIONS } from './page-client.const';
import type { PagePlacement, PageRegionName } from './page-client.types';

/**
 * Куда открыть переход: экран на месте остаётся на месте, объявленный
 * приложением страниц — в своей области, прочие — по положению источника.
 */
export class PagePlacements {
  private readonly declared = new Map<string, PageRegionName>();

  /** Экран вне набора и повтор экрана — ошибка программиста, бросок. */
  constructor(ids: UiIds, placements: readonly PagePlacement[]) {
    for (const placement of placements) {
      // Область вне перечня возможна только при вызове из JS.
      if (!(PAGE_REGIONS as readonly string[]).includes(placement.region)) {
        throw new Error(
          `PageClient: область ${placement.region} в placements не из перечня`,
        );
      }
      let id: string;
      try {
        id = ids.screen(placement.screen);
      } catch (cause) {
        throw new Error(
          `PageClient: экран ${placement.screen.name} в placements не из набора приложения`,
          { cause },
        );
      }
      if (this.declared.has(id)) {
        throw new Error(`PageClient: экран ${id} объявлен в placements дважды`);
      }
      this.declared.set(id, placement.region);
    }
  }

  /**
   * Область для экрана `screen`: `from` — область источника (у ссылки
   * уведомления нет), `current` — экран, открытый в ней.
   */
  target(
    from: PageRegionName | undefined,
    current: string | undefined,
    screen: string,
  ): PageRegionName {
    if (from !== undefined && current === screen) return from;
    const declared = this.declared.get(screen);
    if (declared !== undefined) return declared;
    return from === 'side' || from === 'modal' ? 'main' : 'side';
  }
}
