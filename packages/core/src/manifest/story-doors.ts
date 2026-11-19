import type { ScreenAction } from './screen-action';
import type { AnyScreenDef } from './screen-def.types';
import type { AnyStoryDef } from './story-def.types';
import type { AnyUiAppDef } from './ui-app-def.types';

/**
 * Двери экранов приложения UI (D-UI-107): действие без UC, которое ведёт на
 * старт сторис приложения, связанной от сторис с этим экраном. Переход на
 * свой экран и сторис вне приложения дверью не считаются. Одно решение для
 * вида экземпляра (подсказка двери) и справки (`ScreenHelp`); без приложения
 * дверей нет. Доступность сторис не вычисляется (D-UI-94).
 */
export class StoryDoors {
  private constructor(
    /** Экран → сторис приложения из связей сторис с этим экраном, по порядку связей. */
    private readonly led: ReadonlyMap<AnyScreenDef, readonly AnyStoryDef[]>,
  ) {}

  static of(app: AnyUiAppDef | undefined): StoryDoors {
    const led = new Map<AnyScreenDef, AnyStoryDef[]>();
    if (app === undefined) return new StoryDoors(led);
    const inside = new Set(app.stories);
    for (const story of app.stories) {
      const leads = story.leads().filter((lead) => inside.has(lead));
      for (const screen of story.screens) {
        const known = led.get(screen) ?? [];
        for (const lead of leads) {
          if (!known.includes(lead)) known.push(lead);
        }
        led.set(screen, known);
      }
    }
    return new StoryDoors(led);
  }

  /** Сторис-цели действия экрана в порядке связей; не дверь — пусто. */
  of(screen: AnyScreenDef, action: ScreenAction): readonly AnyStoryDef[] {
    if (action.uc !== undefined) return [];
    const targets = action.targets().filter((target) => target !== screen);
    if (targets.length === 0) return [];
    const led = this.led.get(screen) ?? [];
    return led.filter((story) => targets.includes(story.start));
  }

  /**
   * Подсказка действия: своя, иначе подсказка сторис-цели, если она ровно
   * одна. При двух и более целях подсказки нет — она описывала бы не ту
   * сторис; автор пишет `hint` у действия.
   */
  hint(screen: AnyScreenDef, action: ScreenAction): string | undefined {
    if (action.hint !== undefined) return action.hint;
    const [only, ...rest] = this.of(screen, action);
    return rest.length === 0 ? only?.hint : undefined;
  }
}
