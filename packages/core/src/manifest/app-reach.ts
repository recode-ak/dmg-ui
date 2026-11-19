import type { ScreenAction } from './screen-action';
import type { AnyScreenDef } from './screen-def.types';
import type { AnyStoryDef } from './story-def.types';
import { StoryDoors } from './story-doors';
import type { AnyUiAppDef } from './ui-app-def.types';

/**
 * Состав приложения UI (D-UI-95, D-UI-107): какие сторис из связей его
 * сторис в него не вошли, какое действие ведёт только в них и какие действия
 * — двери (`doors`). Одно решение для графа (ребро `omits`) и исполнителя
 * (вид и `act`); канал его не принимает. Без приложения (превью, исполнитель
 * без приложения) ничего не отрезано и дверей нет.
 */
export class AppReach {
  private constructor(
    private readonly left: readonly AnyStoryDef[],
    private readonly cutScreens: ReadonlySet<AnyScreenDef>,
    /** Двери экранов приложения: подсказка двери в виде экземпляра. */
    readonly doors: StoryDoors,
  ) {}

  static of(app: AnyUiAppDef | undefined): AppReach {
    if (app === undefined) {
      return new AppReach([], new Set(), StoryDoors.of(undefined));
    }
    const inside = new Set(app.stories);
    const left = new Set<AnyStoryDef>();
    for (const story of app.stories) {
      for (const lead of story.leads()) {
        if (!inside.has(lead)) left.add(lead);
      }
    }
    const screens = new Set(app.stories.flatMap((story) => story.screens));
    const cut = [...left]
      .flatMap((story) => story.screens)
      .filter((screen) => !screens.has(screen));
    return new AppReach([...left], new Set(cut), StoryDoors.of(app));
  }

  /**
   * Действие отрезано: у него есть переход, нет UC, и каждый экран-цель —
   * вне сторис приложения, в отрезанной сторис. Переход вне сторис
   * приложения без связи не отрезается: его называет правило UI-05.
   */
  cuts(screen: AnyScreenDef, action: ScreenAction): boolean {
    if (action.uc !== undefined) return false;
    const targets = action.targets();
    return (
      targets.length > 0 &&
      targets.every(
        (target) => target !== screen && this.cutScreens.has(target),
      )
    );
  }

  /**
   * Сторис из прямых связей сторис приложения, которых в приложении нет, —
   * по одной, в порядке связей; дальние связи не считаются.
   */
  omitted(): readonly AnyStoryDef[] {
    return this.left;
  }
}
