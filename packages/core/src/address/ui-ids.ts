import type { AnyNotificationDef } from '../manifest/notification-def.types';
import type { AnyScreenDef } from '../manifest/screen-def.types';
import type { AnyStoryDef } from '../manifest/story-def.types';
import type { AnyUiAppDef } from '../manifest/ui-app-def.types';
import type { AnyUiModuleDef } from '../manifest/ui-module-def.types';
import type { AnyUiSetDef } from '../manifest/ui-set-def.types';
import type { UiTarget } from './ui-ids.types';

/** Корень внешних `id`: Def вне набора UI (по соглашению `DomainIds`). */
const ORPHAN_ROOT = 'dmg-ui/orphan';

/**
 * Идентификаторы узлов набора UI: `id` экрана, сторис и уведомления —
 * `<набор>/<модуль>/<имя>`. Одно вычисление `id` для адресов и графа (граф
 * расширяет его, а не пишет второе). Чистый: графа платформы не знает.
 */
export class UiIds {
  private readonly setName: string;
  private readonly claimed = new Set<string>();
  private readonly ofDef = new Map<object, string>();
  private readonly screens = new Map<string, AnyScreenDef>();

  /**
   * Повтор `id` в модуле (экран, сторис, уведомление с одним именем) или один
   * Def в двух модулях — ошибка программиста, бросок.
   */
  constructor(set: AnyUiSetDef) {
    this.setName = set.name;
    for (const module of set.modules) {
      this.ofDef.set(module, `${set.name}/${module.name}`);
      for (const screen of module.screens) {
        const id = this.claim(set, module, 'экран', screen);
        this.screens.set(id, screen);
      }
      for (const story of module.stories) {
        this.claim(set, module, 'сторис', story);
      }
      for (const notification of module.notifications ?? []) {
        this.claim(set, module, 'уведомление', notification);
      }
    }
  }

  /** `id` набора — его имя. */
  set(): string {
    return this.setName;
  }

  /** `id` модуля набора; модуль вне набора — ошибка программиста, бросок. */
  module(def: AnyUiModuleDef): string {
    return this.known(def, 'модуль');
  }

  /** `id` экрана; экран вне набора — ошибка программиста, бросок. */
  screen(def: AnyScreenDef): string {
    return this.known(def, 'экран');
  }

  /** `id` сторис; сторис вне набора — ошибка программиста, бросок. */
  story(def: AnyStoryDef): string {
    return this.known(def, 'сторис');
  }

  /** `id` уведомления; уведомление вне набора — ошибка программиста, бросок. */
  notification(def: AnyNotificationDef): string {
    return this.known(def, 'уведомление');
  }

  /** `id` действия — под своим экраном. */
  action(screen: AnyScreenDef, name: string): string {
    return `${this.screen(screen)}/${name}`;
  }

  /** `id` приложения UI — его имя: приложение не входит в набор. */
  app(def: AnyUiAppDef): string {
    return def.name;
  }

  /**
   * `id` конца ребра: Def набора — его `id`, Def вне набора — внешний
   * `dmg-ui/orphan/<dmg>/<имя>` без броска; такую ссылку ловит правило графа.
   */
  target(def: UiTarget): string {
    return this.ofDef.get(def) ?? `${ORPHAN_ROOT}/${def.dmg}/${def.name}`;
  }

  findScreen(id: string): AnyScreenDef | undefined {
    return this.screens.get(id);
  }

  private claim(
    set: AnyUiSetDef,
    module: AnyUiModuleDef,
    what: string,
    def: UiTarget,
  ): string {
    const id = `${set.name}/${module.name}/${def.name}`;
    if (this.claimed.has(id)) {
      throw new Error(`UiIds: повтор id ${id}`);
    }
    if (this.ofDef.has(def)) {
      throw new Error(
        `UiIds: ${what} ${def.name} входит в два модуля набора ${set.name}`,
      );
    }
    this.claimed.add(id);
    this.ofDef.set(def, id);
    return id;
  }

  private known(def: object & { readonly name: string }, what: string): string {
    const id = this.ofDef.get(def);
    if (id === undefined) {
      throw new Error(`UiIds: ${what} ${def.name} вне набора`);
    }
    return id;
  }
}
