import { type AnyUiAppDef, type AnyUiSetDef, ModuleRegistries } from 'dmg-ui';
import { PageViews } from './page-views';
import type {
  AnyPageNotePresenter,
  AnyPagePresenter,
} from './page-views.types';

/**
 * Сборка представлений страницы для области — приложения UI или набора
 * целиком — из реестров модулей (`PageViews`): у модуля области ровно один
 * реестр (UI-06). Поиск — по `id` из `UiIds` у реестра модуля-хозяина;
 * уведомление из внешних данных ищется без броска (D-UI-55).
 */
export class AppPageViews {
  private constructor(private readonly modules: ModuleRegistries<PageViews>) {}

  /** Сборка приложения UI; отказ полноты — бросок UI-06. */
  static of(app: AnyUiAppDef, modules: readonly PageViews[]): AppPageViews {
    return new AppPageViews(
      ModuleRegistries.of(PageViews.completeness, app, modules),
    );
  }

  /** Сборка набора целиком: превью. */
  static ofSet(set: AnyUiSetDef, modules: readonly PageViews[]): AppPageViews {
    return new AppPageViews(
      ModuleRegistries.ofSet(PageViews.completeness, set, modules),
    );
  }

  get set(): AnyUiSetDef {
    return this.modules.set;
  }

  /** Приложение сборки; у сборки набора — `undefined`. */
  get app(): AnyUiAppDef | undefined {
    return this.modules.app;
  }

  /** Представление экрана по `id`; нет в сборке — бросок с `id`. */
  screen(id: string): AnyPagePresenter {
    const def = this.modules.ids.findScreen(id);
    const owner = def === undefined ? undefined : this.modules.find(def);
    if (def === undefined || owner === undefined) {
      throw new Error(`PageViews: нет представления экрана ${id}`);
    }
    return owner.screen(def);
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
    const def = this.modules.ids.findNotification(id);
    return def === undefined
      ? undefined
      : this.modules.find(def)?.notification(def);
  }
}
