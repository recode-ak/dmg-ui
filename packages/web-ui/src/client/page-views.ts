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
  AnyPageNotePresenter,
  AnyPagePresenter,
  PageNoteRender,
  PageScreenRender,
} from './page-views.types';

export type {
  AnyPageNotePresenter,
  AnyPagePresenter,
  PageNoteRender,
  PageScreenRender,
} from './page-views.types';

/** Представление экрана на странице: текст тела по виду. */
export class PagePresenter<D extends AnyScreenDef> implements AnyPagePresenter {
  private constructor(
    readonly def: D,
    private readonly render: PageScreenRender<D>,
  ) {}

  static for<D extends AnyScreenDef>(
    def: D,
    render: PageScreenRender<D>,
  ): PagePresenter<D> {
    return new PagePresenter(def, render);
  }

  text(view: InstanceView): string {
    // Единственное приведение канала: `data` и `state` вида этого экрана
    // исполнитель уже проверил схемами экрана (`load`, `restore`, пример
    // `ScreenPreview`); реестр отдаёт вид только представлению его экрана —
    // по `id` из `UiIds`.
    return this.render(view as ScreenViewOf<D>);
  }
}

/** Представление уведомления на странице: текст по данным. */
export class PageNotePresenter<D extends AnyNotificationDef>
  implements AnyPageNotePresenter
{
  private constructor(
    readonly def: D,
    private readonly render: PageNoteRender<D>,
  ) {}

  static for<D extends AnyNotificationDef>(
    def: D,
    render: PageNoteRender<D>,
  ): PageNotePresenter<D> {
    return new PageNotePresenter(def, render);
  }

  /** Данные пришли по проводу: проверка схемой уведомления, не приведение. */
  text(data: unknown): string {
    return this.render(v.parse(this.def.data, data));
  }
}

/**
 * Реестр представлений страничного канала для одного набора UI: ключ — `id`
 * экрана и уведомления из `UiIds`. Нет представления — ошибка сборки канала
 * (ERR-01), бросок с `id`.
 */
export class PageViews {
  private constructor(
    readonly set: AnyUiSetDef,
    private readonly screens: ReadonlyMap<string, AnyPagePresenter>,
    private readonly notifications: ReadonlyMap<string, AnyPageNotePresenter>,
  ) {}

  /** Def вне набора или два представления одного Def — бросок. */
  static of(
    set: AnyUiSetDef,
    presenters: readonly (AnyPagePresenter | AnyPageNotePresenter)[],
  ): PageViews {
    const ids = new UiIds(set);
    const screens = new Map<string, AnyPagePresenter>();
    const notifications = new Map<string, AnyPageNotePresenter>();
    for (const presenter of presenters) {
      if (presenter instanceof PagePresenter) {
        PageViews.put(screens, ids.screen(presenter.def), presenter);
      } else if (presenter instanceof PageNotePresenter) {
        PageViews.put(
          notifications,
          ids.notification(presenter.def),
          presenter,
        );
      } else {
        throw new Error(
          'PageViews: представление — не PagePresenter и не PageNotePresenter',
        );
      }
    }
    return new PageViews(set, screens, notifications);
  }

  /** Представление экрана по `id`. */
  screen(id: string): AnyPagePresenter {
    const presenter = this.screens.get(id);
    if (presenter === undefined) {
      throw new Error(`PageViews: нет представления экрана ${id}`);
    }
    return presenter;
  }

  /** Представление уведомления по `id`; нет — бросок. */
  notification(id: string): AnyPageNotePresenter {
    const presenter = this.findNotification(id);
    if (presenter === undefined) {
      throw new Error(`PageViews: нет представления уведомления ${id}`);
    }
    return presenter;
  }

  /** Представление уведомления по `id` из внешних данных; нет — `undefined`. */
  findNotification(id: string): AnyPageNotePresenter | undefined {
    return this.notifications.get(id);
  }

  /** `id` экранов и уведомлений с представлением — для рёбер `presents`. */
  presented(): readonly string[] {
    return [...this.screens.keys(), ...this.notifications.keys()];
  }

  private static put<P>(map: Map<string, P>, id: string, presenter: P): void {
    if (map.has(id)) {
      throw new Error(`PageViews: два представления ${id}`);
    }
    map.set(id, presenter);
  }
}
