import {
  type AnyNotificationDef,
  type AnyScreenDef,
  type AnyUiSetDef,
  type InstanceView,
  type ScreenViewOf,
  UiIds,
} from 'dmg-ui';
import * as v from 'valibot';
import type {
  AnyNotificationPresenter,
  AnyScreenPresenter,
  CaughtTexts,
  NotificationRender,
  ScreenRender,
} from './dialog-views.types';

export type {
  AnyNotificationPresenter,
  AnyScreenPresenter,
  CaughtTexts,
  NotificationRender,
  ScreenRender,
} from './dialog-views.types';

/** Представление экрана в диалоге: текст тела по виду и свои тексты отказов. */
export class ScreenPresenter<D extends AnyScreenDef>
  implements AnyScreenPresenter
{
  private constructor(
    readonly def: D,
    private readonly render: ScreenRender<D>,
    private readonly texts: CaughtTexts,
  ) {}

  /** `caught` — текст отказа по коду из `catches` экрана. */
  static for<D extends AnyScreenDef>(
    def: D,
    render: ScreenRender<D>,
    caught: CaughtTexts = {},
  ): ScreenPresenter<D> {
    return new ScreenPresenter(def, render, caught);
  }

  text(view: InstanceView): string {
    // Единственное приведение канала (D-UI-27): `data` и `state` вида этого
    // экрана исполнитель уже проверил схемами экрана (`load`, `restore`,
    // пример `ScreenPreview`); реестр отдаёт вид только представлению его
    // экрана — по `id` из `UiIds`.
    return this.render(view as ScreenViewOf<D>);
  }

  caught(code: string): string | undefined {
    return this.texts[code];
  }
}

/** Представление уведомления в диалоге: текст по данным. */
export class NotificationPresenter<D extends AnyNotificationDef>
  implements AnyNotificationPresenter
{
  private constructor(
    readonly def: D,
    private readonly render: NotificationRender<D>,
  ) {}

  static for<D extends AnyNotificationDef>(
    def: D,
    render: NotificationRender<D>,
  ): NotificationPresenter<D> {
    return new NotificationPresenter(def, render);
  }

  /** Данные пришли от сервера: проверка схемой уведомления, не приведение. */
  text(data: unknown): string {
    return this.render(v.parse(this.def.data, data));
  }
}

/**
 * Реестр представлений диалога для одного набора UI: ключ — `id` экрана и
 * уведомления из `UiIds`. Нет представления — ошибка сборки канала (правило
 * графа UI-06 ловит её раньше), бросок с `id`.
 */
export class DialogViews {
  private constructor(
    readonly set: AnyUiSetDef,
    private readonly screens: ReadonlyMap<string, AnyScreenPresenter>,
    private readonly notifications: ReadonlyMap<
      string,
      AnyNotificationPresenter
    >,
  ) {}

  /** Def вне набора или два представления одного Def — бросок. */
  static of(
    set: AnyUiSetDef,
    presenters: readonly (AnyScreenPresenter | AnyNotificationPresenter)[],
  ): DialogViews {
    const ids = new UiIds(set);
    const screens = new Map<string, AnyScreenPresenter>();
    const notifications = new Map<string, AnyNotificationPresenter>();
    for (const presenter of presenters) {
      if (presenter instanceof ScreenPresenter) {
        DialogViews.put(screens, ids.screen(presenter.def), presenter);
      } else if (presenter instanceof NotificationPresenter) {
        DialogViews.put(
          notifications,
          ids.notification(presenter.def),
          presenter,
        );
      } else {
        throw new Error(
          'DialogViews: представление — не ScreenPresenter и не NotificationPresenter',
        );
      }
    }
    return new DialogViews(set, screens, notifications);
  }

  /** Представление экрана по `id`. */
  screen(id: string): AnyScreenPresenter {
    const presenter = this.screens.get(id);
    if (presenter === undefined) {
      throw new Error(`DialogViews: нет представления экрана ${id}`);
    }
    return presenter;
  }

  /** Представление уведомления по `id`. */
  notification(id: string): AnyNotificationPresenter {
    const presenter = this.notifications.get(id);
    if (presenter === undefined) {
      throw new Error(`DialogViews: нет представления уведомления ${id}`);
    }
    return presenter;
  }

  /** `id` экранов и уведомлений с представлением — для рёбер `presents`. */
  presented(): readonly string[] {
    return [...this.screens.keys(), ...this.notifications.keys()];
  }

  private static put<P>(map: Map<string, P>, id: string, presenter: P): void {
    if (map.has(id)) {
      throw new Error(`DialogViews: два представления ${id}`);
    }
    map.set(id, presenter);
  }
}
