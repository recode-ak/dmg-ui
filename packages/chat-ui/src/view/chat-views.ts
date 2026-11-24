import {
  type AnyNotificationDef,
  type AnyScreenDef,
  type AnyUiModuleDef,
  UiCompleteness,
} from 'dmg-ui';
import { NotificationPresenter } from './notification-presenter';
import { ScreenPresenter } from './screen-presenter';
import type {
  AnyNotificationPresenter,
  AnyScreenPresenter,
} from './view.types';

/** Представления одного слоя по Def экрана и уведомления. */
type Layer = {
  readonly screens: ReadonlyMap<object, AnyScreenPresenter>;
  readonly notifications: ReadonlyMap<object, AnyNotificationPresenter>;
};

/** Представления, из которых строится слой реестра. */
type Presenters = readonly (AnyScreenPresenter | AnyNotificationPresenter)[];

/**
 * Реестр представлений одного UI-модуля в мессенджере (D-UI-50): ключ — Def
 * экрана и уведомления модуля; каждому — ровно одно представление, иначе
 * отказ UI-06. `over` даёт новый реестр того же модуля, где представления
 * пакета мессенджера перекрывают базовые по Def. Сборку области из реестров
 * модулей делает `AppChatViews`.
 */
export class ChatViews {
  /** Проверка полноты реестров представлений мессенджера и их сборок (UI-06). */
  static readonly completeness = new UiCompleteness(
    'ChatViews',
    'представления',
  );

  private constructor(
    readonly module: AnyUiModuleDef,
    private readonly layer: Layer,
  ) {}

  /** Отказ UI-06: нет представления, представление вне модуля, два на Def. */
  static of(module: AnyUiModuleDef, presenters: Presenters): ChatViews {
    ChatViews.completeness.module(module, ChatViews.defs(presenters));
    return new ChatViews(module, ChatViews.layerOf(presenters));
  }

  /** Новый реестр с перекрытием по Def; прежний не меняется. Def вне модуля, два в слое — отказ UI-06. */
  over(presenters: Presenters): ChatViews {
    ChatViews.completeness.part(this.module, ChatViews.defs(presenters));
    const own = ChatViews.layerOf(presenters);
    return new ChatViews(this.module, {
      screens: new Map([...this.layer.screens, ...own.screens]),
      notifications: new Map([
        ...this.layer.notifications,
        ...own.notifications,
      ]),
    });
  }

  /** Представление экрана модуля; экран вне модуля — бросок программисту. */
  screen(def: AnyScreenDef): AnyScreenPresenter {
    const presenter = this.layer.screens.get(def);
    if (presenter === undefined) {
      throw new Error(
        `ChatViews: экран ${def.name} вне модуля ${this.module.name}`,
      );
    }
    return presenter;
  }

  /** Представление уведомления модуля; так же, как `screen`. */
  notification(def: AnyNotificationDef): AnyNotificationPresenter {
    const presenter = this.layer.notifications.get(def);
    if (presenter === undefined) {
      throw new Error(
        `ChatViews: уведомление ${def.name} вне модуля ${this.module.name}`,
      );
    }
    return presenter;
  }

  private static defs(
    presenters: Presenters,
  ): readonly (AnyScreenDef | AnyNotificationDef)[] {
    return presenters.map((presenter) => presenter.def);
  }

  private static layerOf(presenters: Presenters): Layer {
    const screens = new Map<object, AnyScreenPresenter>();
    const notifications = new Map<object, AnyNotificationPresenter>();
    for (const presenter of presenters) {
      if (presenter instanceof ScreenPresenter) {
        screens.set(presenter.def, presenter);
      } else if (presenter instanceof NotificationPresenter) {
        notifications.set(presenter.def, presenter);
      } else {
        throw new Error(
          'ChatViews: представление — не ScreenPresenter и не NotificationPresenter',
        );
      }
    }
    return { screens, notifications };
  }
}
