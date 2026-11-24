import type { AnyNotificationDef } from '../manifest/notification-def.types';
import type { AnyScreenDef } from '../manifest/screen-def.types';
import type { AnyUiModuleDef } from '../manifest/ui-module-def.types';
import type { ScreenCode } from '../screen/screen-code';
import type { CodeTarget } from './code-loaders.types';
import type { NotificationCode } from './notification-code';
import { ScreenUnit } from './screen-unit';
import type { AnyScreenUnit } from './screen-unit.types';
import { UiCompleteness } from './ui-completeness';

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
 * Реестр кода одного UI-модуля: «Def → загрузчик». Каждому экрану и
 * уведомлению модуля — ровно один загрузчик, иначе отказ UI-06. Код грузится
 * при первом обращении; промис общий у всех исполнителей реестра.
 */
export class CodeLoaders {
  /** Проверка полноты реестров кода и их сборок (UI-06). */
  static readonly completeness = new UiCompleteness(
    'CodeLoaders',
    'загрузчика',
  );
  readonly module: AnyUiModuleDef;
  private readonly targets: ReadonlyMap<object, CodeTarget>;
  private readonly screens = new Map<object, Promise<AnyScreenUnit>>();
  private readonly notifications = new Map<
    object,
    Promise<NotificationCode<AnyNotificationDef>>
  >();

  private constructor(module: AnyUiModuleDef, loaders: readonly CodeLoader[]) {
    CodeLoaders.completeness.module(
      module,
      loaders.map(({ target }) => target.def),
    );
    this.module = module;
    this.targets = new Map(loaders.map(({ target }) => [target.def, target]));
  }

  static of(
    module: AnyUiModuleDef,
    loaders: readonly CodeLoader[],
  ): CodeLoaders {
    return new CodeLoaders(module, loaders);
  }

  /** Юнит экрана модуля; загрузка — при первом вызове, сбой не кэшируется. */
  screen(def: AnyScreenDef): Promise<AnyScreenUnit> {
    const target = this.targets.get(def);
    if (target?.kind !== 'screen') {
      throw new Error(
        `CodeLoaders: экран ${def.name} вне модуля ${this.module.name}`,
      );
    }
    return this.cached(this.screens, def, target.make);
  }

  /** Код уведомления модуля; так же, как `screen`. */
  notification(
    def: AnyNotificationDef,
  ): Promise<NotificationCode<AnyNotificationDef>> {
    const target = this.targets.get(def);
    if (target?.kind !== 'notification') {
      throw new Error(
        `CodeLoaders: уведомление ${def.name} вне модуля ${this.module.name}`,
      );
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
