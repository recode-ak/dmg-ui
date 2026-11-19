import type { AnyNotificationDef } from '../manifest/notification-def.types';
import type { AnyScreenDef } from '../manifest/screen-def.types';
import type { AnyUiSetDef } from '../manifest/ui-set-def.types';
import type { ScreenCode } from '../screen/screen-code';
import type { CodeTarget } from './code-loaders.types';
import type { NotificationCode } from './notification-code';
import { ScreenUnit } from './screen-unit';
import type { AnyScreenUnit } from './screen-unit.types';

export type { CodeTarget } from './code-loaders.types';

/**
 * Загрузчик кода одного экрана или уведомления: обычно `() => import(...)`.
 * Манифест о коде не знает: связь задаётся в корне сборки.
 */
export class CodeLoader {
  readonly target: CodeTarget;

  private constructor(target: CodeTarget) {
    this.target = target;
  }

  /** Код с любым типом субъекта (`never` — верхний тип по субъекту, см. `ScreenUnit`). */
  static screen<D extends AnyScreenDef>(
    def: D,
    load: () => Promise<ScreenCode<D, never>>,
  ): CodeLoader {
    return new CodeLoader({
      kind: 'screen',
      def,
      make: async () => new ScreenUnit(def, await load()),
    });
  }

  static notification<D extends AnyNotificationDef>(
    def: D,
    load: () => Promise<NotificationCode<D>>,
  ): CodeLoader {
    return new CodeLoader({ kind: 'notification', def, make: load });
  }
}

/**
 * Карта «Def → загрузчик» набора UI. Каждому экрану и уведомлению набора —
 * ровно один загрузчик, иначе бросок со списком имён. Код грузится при
 * первом обращении; промис общий у всех исполнителей карты.
 */
export class CodeLoaders {
  readonly set: AnyUiSetDef;
  private readonly targets: ReadonlyMap<object, CodeTarget>;
  private readonly screens = new Map<object, Promise<AnyScreenUnit>>();
  private readonly notifications = new Map<
    object,
    Promise<NotificationCode<AnyNotificationDef>>
  >();

  private constructor(set: AnyUiSetDef, loaders: readonly CodeLoader[]) {
    this.set = set;
    const targets = new Map<object, CodeTarget>();
    for (const { target } of loaders) {
      if (targets.has(target.def)) {
        throw new Error(`CodeLoaders: два загрузчика для ${target.def.name}`);
      }
      targets.set(target.def, target);
    }
    const defs = set.modules.flatMap((m) => [
      ...m.screens,
      ...(m.notifications ?? []),
    ]);
    const missing = defs.filter((def) => !targets.has(def));
    if (missing.length > 0) {
      const names = missing.map((def) => def.name).join(', ');
      throw new Error(
        `CodeLoaders: в наборе ${set.name} нет загрузчика для ${names}`,
      );
    }
    const extra = [...targets.values()].filter(
      ({ def }) => !defs.some((known) => known === def),
    );
    if (extra.length > 0) {
      const names = extra.map(({ def }) => def.name).join(', ');
      throw new Error(`CodeLoaders: ${names} вне набора ${set.name}`);
    }
    this.targets = targets;
  }

  static of(set: AnyUiSetDef, loaders: readonly CodeLoader[]): CodeLoaders {
    return new CodeLoaders(set, loaders);
  }

  /** Юнит экрана набора; загрузка — при первом вызове, сбой не кэшируется. */
  screen(def: AnyScreenDef): Promise<AnyScreenUnit> {
    const target = this.targets.get(def);
    if (target?.kind !== 'screen') {
      throw new Error(`CodeLoaders: экран ${def.name} вне набора`);
    }
    return this.cached(this.screens, def, target.make);
  }

  /** Код уведомления набора; так же, как `screen`. */
  notification(
    def: AnyNotificationDef,
  ): Promise<NotificationCode<AnyNotificationDef>> {
    const target = this.targets.get(def);
    if (target?.kind !== 'notification') {
      throw new Error(`CodeLoaders: уведомление ${def.name} вне набора`);
    }
    return this.cached(this.notifications, def, target.make);
  }

  private cached<T>(
    cache: Map<object, Promise<T>>,
    def: object,
    make: () => Promise<T>,
  ): Promise<T> {
    const hit = cache.get(def);
    if (hit !== undefined) return hit;
    const loading = make();
    cache.set(def, loading);
    loading.catch(() => cache.delete(def));
    return loading;
  }
}
