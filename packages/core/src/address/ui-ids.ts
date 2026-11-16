import type { AnyScreenDef } from '../manifest/screen-def.types';
import type { AnyUiSetDef } from '../manifest/ui-set-def.types';

/**
 * Идентификаторы узлов набора UI: `id` экрана — `<набор>/<модуль>/<экран>`.
 * Одно вычисление `id` для адресов и графа (граф расширяет его, а не пишет
 * второе).
 */
export class UiIds {
  private readonly byId = new Map<string, AnyScreenDef>();
  private readonly ofScreen = new Map<AnyScreenDef, string>();

  /**
   * Повтор `id` экрана или один Def экрана в двух модулях — ошибка
   * программиста, бросок.
   */
  constructor(set: AnyUiSetDef) {
    for (const module of set.modules) {
      for (const screen of module.screens) {
        const id = `${set.name}/${module.name}/${screen.name}`;
        if (this.byId.has(id)) {
          throw new Error(`UiIds: повтор id экрана ${id}`);
        }
        if (this.ofScreen.has(screen)) {
          throw new Error(
            `UiIds: экран ${screen.name} входит в два модуля набора ${set.name}`,
          );
        }
        this.byId.set(id, screen);
        this.ofScreen.set(screen, id);
      }
    }
  }

  /** `id` экрана; экран вне набора — ошибка программиста, бросок. */
  screen(def: AnyScreenDef): string {
    const id = this.ofScreen.get(def);
    if (id === undefined) {
      throw new Error(`UiIds: экран ${def.name} вне набора`);
    }
    return id;
  }

  findScreen(id: string): AnyScreenDef | undefined {
    return this.byId.get(id);
  }
}
