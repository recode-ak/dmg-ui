import { UiIds } from '../address/ui-ids';
import type { AnyNotificationDef } from '../manifest/notification-def.types';
import type { AnyScreenDef } from '../manifest/screen-def.types';
import type { AnyUiAppDef } from '../manifest/ui-app-def.types';
import type { AnyUiModuleDef } from '../manifest/ui-module-def.types';
import type { AnyUiSetDef } from '../manifest/ui-set-def.types';
import type { ModuleRegistry, RegistryScope } from './module-registries.types';
import type { UiCompleteness } from './ui-completeness';

export type { ModuleRegistry, RegistryScope } from './module-registries.types';

/**
 * Сборка реестров модулей одной области — приложения UI или набора целиком:
 * у каждого модуля области ровно один реестр (UI-06, `UiCompleteness`).
 * Маршрут «Def экрана или уведомления → реестр модуля-хозяина» и `id` узлов
 * набора (`UiIds`) — общие для сборок кода и представлений каналов.
 */
export class ModuleRegistries<R extends ModuleRegistry> {
  readonly ids: UiIds;
  private readonly list: readonly R[];
  private readonly owners: ReadonlyMap<object, R>;

  private constructor(
    check: UiCompleteness,
    scope: RegistryScope,
    readonly set: AnyUiSetDef,
    readonly app: AnyUiAppDef | undefined,
    list: readonly R[],
  ) {
    check.scope(
      scope,
      ModuleRegistries.required(scope),
      list.map((registry) => registry.module),
    );
    this.ids = new UiIds(set);
    this.list = list;
    const owners = new Map<object, R>();
    for (const registry of list) {
      const { screens, notifications } = registry.module;
      for (const def of [...screens, ...notifications])
        owners.set(def, registry);
    }
    this.owners = owners;
  }

  /** Сборка приложения UI; отказ полноты — бросок UI-06. */
  static of<R extends ModuleRegistry>(
    check: UiCompleteness,
    app: AnyUiAppDef,
    list: readonly R[],
  ): ModuleRegistries<R> {
    return new ModuleRegistries(check, app, app.set, app, list);
  }

  /** Сборка набора целиком (превью, исполнитель без приложения). */
  static ofSet<R extends ModuleRegistry>(
    check: UiCompleteness,
    set: AnyUiSetDef,
    list: readonly R[],
  ): ModuleRegistries<R> {
    return new ModuleRegistries(check, set, set, undefined, list);
  }

  /**
   * Модули области в порядке набора. Набора — все. Приложения — хозяева его
   * сторис и их экранов, его уведомлений и экранов его входов; отрезанные
   * сторис и цели ссылок уведомлений не входят.
   */
  static required(scope: RegistryScope): readonly AnyUiModuleDef[] {
    if (scope.dmg === 'uiSet') return scope.modules;
    const used = new Set<object>([
      ...scope.stories,
      ...scope.stories.flatMap((story) => story.screens),
      ...scope.notifications,
      ...Object.values(scope.entries).map((entry) => entry.address.screen),
    ]);
    return scope.set.modules.filter((module) =>
      [...module.stories, ...module.screens, ...module.notifications].some(
        (def) => used.has(def),
      ),
    );
  }

  /** Имя области в текстах: `приложения <имя>` или `набора <имя>`. */
  scopeName(): string {
    return this.app === undefined
      ? `набора ${this.set.name}`
      : `приложения ${this.app.name}`;
  }

  /** Реестр модуля-хозяина Def; Def вне сборки — бросок программисту. */
  registry(def: AnyScreenDef | AnyNotificationDef): R {
    const found = this.owners.get(def);
    if (found === undefined) {
      throw new Error(`${def.name} вне сборки ${this.scopeName()}`);
    }
    return found;
  }

  /** Реестр модуля-хозяина Def; вне сборки — `undefined`. */
  find(def: AnyScreenDef | AnyNotificationDef): R | undefined {
    return this.owners.get(def);
  }

  /** Реестры сборки в порядке передачи. */
  registries(): readonly R[] {
    return this.list;
  }
}
