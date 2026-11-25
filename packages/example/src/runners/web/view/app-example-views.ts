import {
  type AnyNotificationDef,
  type AnyScreenDef,
  type AnyUiAppDef,
  type AnyUiSetDef,
  ModuleRegistries,
} from 'dmg-ui';
import type { AnyPageNotePresenter } from 'dmg-ui/web-ui';
import { ExampleViews } from '../../../frontend/web-kit/example-views';
import type { AnyExampleScreen } from '../../../frontend/web-kit/example-views.types';

/**
 * Сборка представлений примера на DOM для области — приложения UI или
 * набора целиком — из реестров модулей (`ExampleViews`): у модуля области
 * ровно один реестр (UI-06). Поиск — по `id` из `UiIds` у реестра
 * модуля-хозяина; `id` из внешних данных ищется без броска.
 */
export class AppExampleViews {
  private constructor(
    private readonly modules: ModuleRegistries<ExampleViews>,
  ) {}

  /** Сборка приложения UI; отказ полноты — бросок UI-06. */
  static of(
    app: AnyUiAppDef,
    modules: readonly ExampleViews[],
  ): AppExampleViews {
    return new AppExampleViews(
      ModuleRegistries.of(ExampleViews.completeness, app, modules),
    );
  }

  /** Сборка набора целиком: кадр области. */
  static ofSet(
    set: AnyUiSetDef,
    modules: readonly ExampleViews[],
  ): AppExampleViews {
    return new AppExampleViews(
      ModuleRegistries.ofSet(ExampleViews.completeness, set, modules),
    );
  }

  get set(): AnyUiSetDef {
    return this.modules.set;
  }

  /** Приложение сборки; у сборки набора — `undefined`. */
  get app(): AnyUiAppDef | undefined {
    return this.modules.app;
  }

  /** Представление экрана по `id`; нет — бросок. */
  screen(id: string): AnyExampleScreen {
    const found = this.findScreen(id);
    if (found === undefined) {
      throw new Error(`ExampleViews: нет представления экрана ${id}`);
    }
    return found;
  }

  /** Представление экрана по `id` из внешних данных; нет — `undefined`. */
  findScreen(id: string): AnyExampleScreen | undefined {
    const def = this.modules.ids.findScreen(id);
    return def === undefined ? undefined : this.modules.find(def)?.screen(def);
  }

  /** Представление уведомления по `id`; нет — бросок. */
  notification(id: string): AnyPageNotePresenter {
    const found = this.findNotification(id);
    if (found === undefined) {
      throw new Error(`ExampleViews: нет представления уведомления ${id}`);
    }
    return found;
  }

  /** Представление уведомления по `id` из внешних данных; нет — `undefined`. */
  findNotification(id: string): AnyPageNotePresenter | undefined {
    const def = this.modules.ids.findNotification(id);
    return def === undefined
      ? undefined
      : this.modules.find(def)?.notification(def);
  }

  /** Реестр модуля-хозяина Def; Def вне сборки — бросок. */
  registry(def: AnyScreenDef | AnyNotificationDef): ExampleViews {
    return this.modules.registry(def);
  }

  /** Реестры модулей в порядке передачи. */
  registries(): readonly ExampleViews[] {
    return this.modules.registries();
  }
}
