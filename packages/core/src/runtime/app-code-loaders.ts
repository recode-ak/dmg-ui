import type { AnyNotificationDef } from '../manifest/notification-def.types';
import type { AnyScreenDef } from '../manifest/screen-def.types';
import type { AnyUiAppDef } from '../manifest/ui-app-def.types';
import type { AnyUiSetDef } from '../manifest/ui-set-def.types';
import { CodeLoaders } from './code-loaders';
import { ModuleRegistries } from './module-registries';
import type { NotificationCode } from './notification-code';
import type { AnyScreenUnit } from './screen-unit.types';

/**
 * Сборка кода области — приложения UI или набора целиком — из реестров
 * модулей (`CodeLoaders`): у модуля области ровно один реестр (UI-06). Код
 * экрана и уведомления — из реестра модуля-хозяина. Её принимают исполнитель,
 * превью и уведомления; сверяют свою область с её.
 */
export class AppCodeLoaders {
  private constructor(
    private readonly registries: ModuleRegistries<CodeLoaders>,
  ) {}

  /** Сборка приложения UI; отказ полноты — бросок UI-06. */
  static of(app: AnyUiAppDef, modules: readonly CodeLoaders[]): AppCodeLoaders {
    return new AppCodeLoaders(
      ModuleRegistries.of(CodeLoaders.completeness, app, modules),
    );
  }

  /** Сборка набора целиком: превью и исполнитель без приложения. */
  static ofSet(
    set: AnyUiSetDef,
    modules: readonly CodeLoaders[],
  ): AppCodeLoaders {
    return new AppCodeLoaders(
      ModuleRegistries.ofSet(CodeLoaders.completeness, set, modules),
    );
  }

  get set(): AnyUiSetDef {
    return this.registries.set;
  }

  /** Приложение сборки; у сборки набора — `undefined`. */
  get app(): AnyUiAppDef | undefined {
    return this.registries.app;
  }

  /** Имя области в текстах: `приложения <имя>` или `набора <имя>`. */
  scopeName(): string {
    return this.registries.scopeName();
  }

  /** Экран модуля сборки. */
  has(def: AnyScreenDef): boolean {
    return this.registries.find(def) !== undefined;
  }

  /** Юнит экрана из реестра модуля-хозяина; экран вне сборки — бросок. */
  screen(def: AnyScreenDef): Promise<AnyScreenUnit> {
    return this.owner(def, 'экран').screen(def);
  }

  /** Код уведомления из реестра модуля-хозяина; вне сборки — бросок. */
  notification(
    def: AnyNotificationDef,
  ): Promise<NotificationCode<AnyNotificationDef>> {
    return this.owner(def, 'уведомление').notification(def);
  }

  private owner(
    def: AnyScreenDef | AnyNotificationDef,
    what: string,
  ): CodeLoaders {
    const found = this.registries.find(def);
    if (found === undefined) {
      throw new Error(
        `AppCodeLoaders: ${what} ${def.name} вне сборки ${this.scopeName()}`,
      );
    }
    return found;
  }
}
