import { type AnyUiSetDef, UiIds } from 'dmg-ui';
import { ExampleUiSetDef } from 'dmg-ui/testing';
import { type AnyPageNotePresenter, PageNotePresenter } from 'dmg-ui/web-ui';
import { AssignedTasksView } from './assigned-tasks.view';
import { ExampleScreenView } from './example-screen-view';
import type { AnyExampleScreen } from './example-views.types';
import { TaskCardView } from './task-card.view';
import { TaskListView } from './task-list.view';
import { TaskAssignedView, TaskCompletedView } from './task-notes.view';
import { UserCardView } from './user-card.view';

export { ExampleScreenView } from './example-screen-view';

/**
 * Реестр представлений примера на DOM для одного набора UI: ключ — `id`
 * экрана и уведомления из `UiIds`. Нет представления или их два — бросок с
 * `id`. Структурно годится как реестр для графа (`set`, `presented()`).
 */
export class ExampleViews {
  private constructor(
    readonly set: AnyUiSetDef,
    private readonly screens: ReadonlyMap<string, AnyExampleScreen>,
    private readonly notes: ReadonlyMap<string, AnyPageNotePresenter>,
  ) {}

  /** Def вне набора или два представления одного Def — бросок. */
  static of(
    set: AnyUiSetDef,
    presenters: readonly (AnyExampleScreen | AnyPageNotePresenter)[],
  ): ExampleViews {
    const ids = new UiIds(set);
    const screens = new Map<string, AnyExampleScreen>();
    const notes = new Map<string, AnyPageNotePresenter>();
    for (const presenter of presenters) {
      if (presenter instanceof ExampleScreenView) {
        ExampleViews.put(screens, ids.screen(presenter.def), presenter);
      } else if (presenter instanceof PageNotePresenter) {
        ExampleViews.put(notes, ids.notification(presenter.def), presenter);
      } else {
        throw new Error(
          'ExampleViews: представление — не ExampleScreenView и не PageNotePresenter',
        );
      }
    }
    return new ExampleViews(set, screens, notes);
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
    return this.screens.get(id);
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
    return this.notes.get(id);
  }

  /** `id` экранов и уведомлений с представлением — для рёбер `presents`. */
  presented(): readonly string[] {
    return [...this.screens.keys(), ...this.notes.keys()];
  }

  private static put<P>(map: Map<string, P>, id: string, presenter: P): void {
    if (map.has(id)) throw new Error(`ExampleViews: два представления ${id}`);
    map.set(id, presenter);
  }
}

/** Готовый реестр примера: четыре экрана и два уведомления учебного набора; меню не показывается. */
export const exampleWebViews = ExampleViews.of(ExampleUiSetDef, [
  TaskListView,
  TaskCardView,
  AssignedTasksView,
  UserCardView,
  TaskAssignedView,
  TaskCompletedView,
]);
