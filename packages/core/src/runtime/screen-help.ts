import { UiIds } from '../address/ui-ids';
import type { AnyScreenDef } from '../manifest/screen-def.types';
import { StoryDoors } from '../manifest/story-doors';
import { StoryTree } from '../manifest/story-tree';
import type { AnyUiAppDef } from '../manifest/ui-app-def.types';
import type { ActionView, InstanceView, LocalView } from './outcome.types';
import type { HelpItem, HelpSheet } from './screen-help.types';

export type { HelpItem, HelpSheet } from './screen-help.types';

/**
 * Содержание справки (D-UI-107) — одно для всех каналов: данные, не текст.
 * Справка по экрану строится только из вида экземпляра: субъекта и Policy не
 * принимает, скрытого и отрезанного составом в виде нет — значит, нет и в
 * справке; отключённое несёт причину из вида. Подписи — из Def, текст —
 * только `hint` (`description` и `goal` — для программиста). Общая справка
 * (без живого экрана) — корни приложения без объявленного `access`: доступ
 * сторис ядро не вычисляет (DEBT-UI-53).
 *
 * @see screen-help.test.ts
 */
export class ScreenHelp {
  private readonly ids: UiIds;
  private readonly doors: StoryDoors;

  constructor(private readonly app: AnyUiAppDef) {
    this.ids = new UiIds(app.set);
    this.doors = StoryDoors.of(app);
  }

  /**
   * Лист по виду: действия, затем локальные — в `items`; доступные двери — в
   * `leads`, отключённая дверь — в `items` с причиной. Вид чужого набора —
   * бросок.
   */
  of(view: InstanceView): HelpSheet {
    const def = this.ids.findScreen(view.screen);
    if (def === undefined) {
      throw new Error(`ScreenHelp: экрана ${view.screen} нет в наборе`);
    }
    const items: HelpItem[] = [];
    const leads: HelpItem[] = [];
    for (const action of view.actions) {
      const item = ScreenHelp.item(
        action,
        ScreenHelp.label(def, 'actions', action.name),
      );
      (this.isLead(def, action) ? leads : items).push(item);
    }
    for (const local of view.locals) {
      items.push(
        ScreenHelp.item(local, ScreenHelp.label(def, 'locals', local.name)),
      );
    }
    return {
      title: def.label,
      ...(view.hint === undefined ? {} : { hint: view.hint }),
      items,
      leads,
    };
  }

  /** Общий лист: подпись приложения и его корни без `access`. */
  general(): HelpSheet {
    const leads = StoryTree.of(this.app)
      .roots()
      .filter((root) => root.access === undefined)
      .map(
        (root): HelpItem => ({
          name: root.name,
          label: root.label,
          ...(root.hint === undefined ? {} : { hint: root.hint }),
        }),
      );
    return { title: this.app.label, items: [], leads };
  }

  /** Доступная дверь в сторис приложения. */
  private isLead(def: AnyScreenDef, view: ActionView): boolean {
    if (view.availability.kind !== 'available') return false;
    const action = def.actions[view.name];
    return action !== undefined && this.doors.of(def, action).length > 0;
  }

  private static item(view: ActionView | LocalView, label: string): HelpItem {
    const { availability } = view;
    return {
      name: view.name,
      label,
      ...(view.hint === undefined ? {} : { hint: view.hint }),
      ...(availability.kind === 'disabled'
        ? { disabled: availability.text }
        : {}),
    };
  }

  /** Подпись из Def; имени нет в Def — вид чужого экрана, бросок. */
  private static label(
    def: AnyScreenDef,
    part: 'actions' | 'locals',
    name: string,
  ): string {
    const found = Object.hasOwn(def[part], name) ? def[part][name] : undefined;
    if (found === undefined) {
      throw new Error(`ScreenHelp: у экрана ${def.name} нет ${part}.${name}`);
    }
    return found.label;
  }
}
