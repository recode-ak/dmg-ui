import type { Address } from '../address/address';
import { UiIds } from '../address/ui-ids';
import type { AnyScreenDef } from './screen-def.types';
import type { ScreenExit } from './screen-exit';
import type { OutcomeSpec } from './story-def.types';
import type { AnyUiAppDef } from './ui-app-def.types';

/** Куда ведёт выход экрана: назад, во вход «в начало» или на адрес. */
export type ExitTarget =
  | { readonly kind: 'back' }
  | { readonly kind: 'home' }
  | { readonly kind: 'at'; readonly address: Address };

const BACK: ExitTarget = { kind: 'back' };
const HOME: ExitTarget = { kind: 'home' };

/**
 * Цели выходов экранов в приложении UI (D-UI-96): по исходам сторис
 * приложения, которые ссылаются на выход. Одно решение для всех каналов —
 * канал цель только исполняет. Нет приложения, сторис или исхода с выходом —
 * `back`. Исходы нескольких сторис с разными целями — нарушение UI-25; здесь
 * берётся первый по порядку сторис приложения. Экран по `id` из внешних
 * данных (вид экземпляра) ищет `find`: экрана нет в наборе — тоже `back`,
 * каналы экран сами не ищут.
 */
export class ExitTargets {
  private constructor(
    private readonly targets: ReadonlyMap<
      AnyScreenDef,
      ReadonlyMap<string, ExitTarget>
    >,
    private readonly ids: UiIds | undefined,
  ) {}

  static of(app: AnyUiAppDef | undefined): ExitTargets {
    const targets = new Map<AnyScreenDef, Map<string, ExitTarget>>();
    for (const story of app?.stories ?? []) {
      for (const outcome of Object.values<OutcomeSpec>(story.outcomes)) {
        for (const exit of outcome.exits) {
          ExitTargets.put(targets, exit, ExitTargets.targetOf(outcome));
        }
      }
    }
    return new ExitTargets(
      targets,
      app === undefined ? undefined : new UiIds(app.set),
    );
  }

  /** Цель выхода `exit` экрана `screen`. */
  of(screen: AnyScreenDef, exit: string): ExitTarget {
    return this.targets.get(screen)?.get(exit) ?? BACK;
  }

  /** Цель выхода `exit` экрана с `id` из внешних данных; экрана нет в наборе — `back`. */
  find(screen: string, exit: string): ExitTarget {
    const def = this.ids?.findScreen(screen);
    return def === undefined ? BACK : this.of(def, exit);
  }

  private static targetOf(outcome: OutcomeSpec): ExitTarget {
    const after = outcome.after ?? 'back';
    if (after === 'back') return BACK;
    if (after === 'home') return HOME;
    return { kind: 'at', address: after };
  }

  /** Первая цель выхода остаётся: порядок сторис приложения. */
  private static put(
    targets: Map<AnyScreenDef, Map<string, ExitTarget>>,
    exit: ScreenExit,
    target: ExitTarget,
  ): void {
    const byExit = targets.get(exit.screen) ?? new Map<string, ExitTarget>();
    if (!byExit.has(exit.name)) byExit.set(exit.name, target);
    targets.set(exit.screen, byExit);
  }
}
