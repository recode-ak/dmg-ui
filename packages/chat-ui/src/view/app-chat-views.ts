import {
  type AnyNotificationDef,
  type AnyScreenDef,
  type AnyUiAppDef,
  type AnyUiSetDef,
  ModuleRegistries,
} from 'dmg-ui';
import { ChatViews } from './chat-views';
import type {
  AnyNotificationPresenter,
  AnyScreenPresenter,
} from './view.types';

/**
 * Сборка представлений мессенджера для области — приложения UI или набора
 * целиком — из реестров модулей (`ChatViews`): у модуля области ровно один
 * реестр (UI-06). Поиск — по `id` из `UiIds`: представление берётся у
 * реестра модуля-хозяина. Перекрытия у сборки нет: перекрытый реестр модуля
 * входит в неё вместо базового.
 */
export class AppChatViews {
  private constructor(private readonly modules: ModuleRegistries<ChatViews>) {}

  /** Сборка приложения UI; отказ полноты — бросок UI-06. */
  static of(app: AnyUiAppDef, modules: readonly ChatViews[]): AppChatViews {
    return new AppChatViews(
      ModuleRegistries.of(ChatViews.completeness, app, modules),
    );
  }

  /** Сборка набора целиком: превью и граф. */
  static ofSet(set: AnyUiSetDef, modules: readonly ChatViews[]): AppChatViews {
    return new AppChatViews(
      ModuleRegistries.ofSet(ChatViews.completeness, set, modules),
    );
  }

  get set(): AnyUiSetDef {
    return this.modules.set;
  }

  /** Приложение сборки; у сборки набора — `undefined`. */
  get app(): AnyUiAppDef | undefined {
    return this.modules.app;
  }

  /** Имя области в текстах: `приложения <имя>` или `набора <имя>`. */
  scopeName(): string {
    return this.modules.scopeName();
  }

  /** Представление экрана по `id`; нет в сборке — бросок с `id`. */
  screen(id: string): AnyScreenPresenter {
    const def = this.modules.ids.findScreen(id);
    const owner = def === undefined ? undefined : this.modules.find(def);
    if (def === undefined || owner === undefined) {
      throw new Error(`ChatViews: нет представления экрана ${id}`);
    }
    return owner.screen(def);
  }

  /** Представление уведомления по `id`; нет в сборке — бросок с `id`. */
  notification(id: string): AnyNotificationPresenter {
    const def = this.modules.ids.findNotification(id);
    const owner = def === undefined ? undefined : this.modules.find(def);
    if (def === undefined || owner === undefined) {
      throw new Error(`ChatViews: нет представления уведомления ${id}`);
    }
    return owner.notification(def);
  }

  /** Реестр модуля-хозяина Def; Def вне сборки — бросок. */
  registry(def: AnyScreenDef | AnyNotificationDef): ChatViews {
    return this.modules.registry(def);
  }

  /** Реестры модулей в порядке передачи. */
  registries(): readonly ChatViews[] {
    return this.modules.registries();
  }

  /** `id` экранов и уведомлений модулей сборки — для рёбер `presents` графа. */
  presented(): readonly string[] {
    const { ids } = this.modules;
    return this.registries().flatMap(({ module }) => [
      ...module.screens.map((def) => ids.screen(def)),
      ...module.notifications.map((def) => ids.notification(def)),
    ]);
  }
}
