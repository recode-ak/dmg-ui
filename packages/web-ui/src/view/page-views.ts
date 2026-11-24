import {
  type AnyNotificationDef,
  type AnyScreenDef,
  type AnyUiModuleDef,
  type InstanceView,
  type ScreenViewOf,
  UiCompleteness,
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
    // `ScreenPreview`); сборка отдаёт вид только представлению его экрана —
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

/** Представления, из которых строится реестр модуля. */
type Presenters = readonly (AnyPagePresenter | AnyPageNotePresenter)[];

/**
 * Реестр представлений одного UI-модуля на странице: ключ — Def экрана и
 * уведомления модуля; каждому — ровно одно представление, иначе отказ UI-06.
 * Сборку области из реестров модулей делает `AppPageViews`.
 */
export class PageViews {
  /** Проверка полноты реестров представлений страницы и их сборок (UI-06). */
  static readonly completeness = new UiCompleteness(
    'PageViews',
    'представления',
  );

  private constructor(
    readonly module: AnyUiModuleDef,
    private readonly screens: ReadonlyMap<object, AnyPagePresenter>,
    private readonly notifications: ReadonlyMap<object, AnyPageNotePresenter>,
  ) {}

  /** Отказ UI-06: нет представления, представление вне модуля, два на Def. */
  static of(module: AnyUiModuleDef, presenters: Presenters): PageViews {
    PageViews.completeness.module(
      module,
      presenters.map((presenter) => presenter.def),
    );
    const screens = new Map<object, AnyPagePresenter>();
    const notifications = new Map<object, AnyPageNotePresenter>();
    for (const presenter of presenters) {
      if (presenter instanceof PagePresenter) {
        screens.set(presenter.def, presenter);
      } else if (presenter instanceof PageNotePresenter) {
        notifications.set(presenter.def, presenter);
      } else {
        throw new Error(
          'PageViews: представление — не PagePresenter и не PageNotePresenter',
        );
      }
    }
    return new PageViews(module, screens, notifications);
  }

  /** Представление экрана модуля; экран вне модуля — бросок программисту. */
  screen(def: AnyScreenDef): AnyPagePresenter {
    const presenter = this.screens.get(def);
    if (presenter === undefined) {
      throw new Error(
        `PageViews: экран ${def.name} вне модуля ${this.module.name}`,
      );
    }
    return presenter;
  }

  /** Представление уведомления модуля; так же, как `screen`. */
  notification(def: AnyNotificationDef): AnyPageNotePresenter {
    const presenter = this.notifications.get(def);
    if (presenter === undefined) {
      throw new Error(
        `PageViews: уведомление ${def.name} вне модуля ${this.module.name}`,
      );
    }
    return presenter;
  }
}
