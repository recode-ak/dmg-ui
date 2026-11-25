import {
  type AnyNotificationDef,
  type AnyScreenDef,
  type AnyUiModuleDef,
  UiCompleteness,
} from 'dmg-ui';
import { type AnyPageNotePresenter, PageNotePresenter } from 'dmg-ui/web-ui';
import { ExampleScreenView } from './example-screen-view';
import type { AnyExampleScreen } from './example-views.types';

export { ExampleScreenView } from './example-screen-view';

/** Представления, из которых строится реестр модуля. */
type Presenters = readonly (AnyExampleScreen | AnyPageNotePresenter)[];

/**
 * Реестр представлений примера на DOM для одного UI-модуля: ключ — Def
 * экрана и уведомления модуля; каждому — ровно одно представление, иначе
 * отказ UI-06. Сборку области из реестров модулей делает `AppExampleViews`.
 */
export class ExampleViews {
  /** Проверка полноты реестров представлений на DOM и их сборок (UI-06). */
  static readonly completeness = new UiCompleteness(
    'ExampleViews',
    'представления',
  );

  private constructor(
    readonly module: AnyUiModuleDef,
    private readonly screens: ReadonlyMap<object, AnyExampleScreen>,
    private readonly notes: ReadonlyMap<object, AnyPageNotePresenter>,
  ) {}

  /** Отказ UI-06: нет представления, представление вне модуля, два на Def. */
  static of(module: AnyUiModuleDef, presenters: Presenters): ExampleViews {
    ExampleViews.completeness.module(
      module,
      presenters.map((presenter) => presenter.def),
    );
    const screens = new Map<object, AnyExampleScreen>();
    const notes = new Map<object, AnyPageNotePresenter>();
    for (const presenter of presenters) {
      if (presenter instanceof ExampleScreenView) {
        screens.set(presenter.def, presenter);
      } else if (presenter instanceof PageNotePresenter) {
        notes.set(presenter.def, presenter);
      } else {
        throw new Error(
          'ExampleViews: представление — не ExampleScreenView и не PageNotePresenter',
        );
      }
    }
    return new ExampleViews(module, screens, notes);
  }

  /** Представление экрана модуля; экран вне модуля — бросок программисту. */
  screen(def: AnyScreenDef): AnyExampleScreen {
    const found = this.screens.get(def);
    if (found === undefined) {
      throw new Error(
        `ExampleViews: экран ${def.name} вне модуля ${this.module.name}`,
      );
    }
    return found;
  }

  /** Представление уведомления модуля; так же, как `screen`. */
  notification(def: AnyNotificationDef): AnyPageNotePresenter {
    const found = this.notes.get(def);
    if (found === undefined) {
      throw new Error(
        `ExampleViews: уведомление ${def.name} вне модуля ${this.module.name}`,
      );
    }
    return found;
  }
}
