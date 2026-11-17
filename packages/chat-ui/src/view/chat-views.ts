import { type AnyUiSetDef, UiIds } from 'dmg-ui';
import { NotificationPresenter } from './notification-presenter';
import { ScreenPresenter } from './screen-presenter';
import type {
  AnyNotificationPresenter,
  AnyScreenPresenter,
} from './view.types';

/** Представления одного слоя по `id` из `UiIds`. */
type Layer = {
  readonly screens: ReadonlyMap<string, AnyScreenPresenter>;
  readonly notifications: ReadonlyMap<string, AnyNotificationPresenter>;
};

/** Представления, из которых строится слой реестра. */
type Presenters = readonly (AnyScreenPresenter | AnyNotificationPresenter)[];

/**
 * Реестр представлений одного приложения мессенджера (D-UI-50): ключ — `id`
 * экрана и уведомления из `UiIds`. Общий слой — `of`; `over` даёт новый
 * реестр, где представления пакета мессенджера перекрывают общие по `id`.
 * Нет представления — ошибка сборки канала (правило графа UI-06 ловит её
 * раньше), бросок с `id`.
 */
export class ChatViews {
  private constructor(
    readonly set: AnyUiSetDef,
    private readonly layer: Layer,
  ) {}

  /** Def вне набора или два представления одного Def — бросок. */
  static of(set: AnyUiSetDef, presenters: Presenters): ChatViews {
    return new ChatViews(set, ChatViews.layerOf(set, presenters));
  }

  /** Новый реестр с перекрытием по `id`; прежний не меняется. Def вне набора, два в одном слое — бросок. */
  over(presenters: Presenters): ChatViews {
    const own = ChatViews.layerOf(this.set, presenters);
    return new ChatViews(this.set, {
      screens: new Map([...this.layer.screens, ...own.screens]),
      notifications: new Map([
        ...this.layer.notifications,
        ...own.notifications,
      ]),
    });
  }

  /** Представление экрана по `id`. */
  screen(id: string): AnyScreenPresenter {
    const presenter = this.layer.screens.get(id);
    if (presenter === undefined) {
      throw new Error(`ChatViews: нет представления экрана ${id}`);
    }
    return presenter;
  }

  /** Представление уведомления по `id`. */
  notification(id: string): AnyNotificationPresenter {
    const presenter = this.layer.notifications.get(id);
    if (presenter === undefined) {
      throw new Error(`ChatViews: нет представления уведомления ${id}`);
    }
    return presenter;
  }

  /** `id` экранов и уведомлений с представлением (общие и перекрытые) — для рёбер `presents`. */
  presented(): readonly string[] {
    return [...this.layer.screens.keys(), ...this.layer.notifications.keys()];
  }

  private static layerOf(set: AnyUiSetDef, presenters: Presenters): Layer {
    const ids = new UiIds(set);
    const screens = new Map<string, AnyScreenPresenter>();
    const notifications = new Map<string, AnyNotificationPresenter>();
    for (const presenter of presenters) {
      if (presenter instanceof ScreenPresenter) {
        ChatViews.put(screens, ids.screen(presenter.def), presenter);
      } else if (presenter instanceof NotificationPresenter) {
        ChatViews.put(
          notifications,
          ids.notification(presenter.def),
          presenter,
        );
      } else {
        throw new Error(
          'ChatViews: представление — не ScreenPresenter и не NotificationPresenter',
        );
      }
    }
    return { screens, notifications };
  }

  private static put<P>(map: Map<string, P>, id: string, presenter: P): void {
    if (map.has(id)) {
      throw new Error(`ChatViews: два представления ${id}`);
    }
    map.set(id, presenter);
  }
}
