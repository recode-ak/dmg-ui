import {
  PageFormModel,
  type PageFormSet,
  type PageViewState,
} from 'dmg-ui/web-ui';
import { BodyFreeze } from './body-freeze';
import { exampleWebViews } from './example-views';
import { RegionControls } from './region-controls';
import type { RegionMark, RegionModel, ScreenBody } from './region-model.types';
import { GESTURE_ACTIONS, MARK_TEXTS } from './view-texts.const';

/**
 * Кадр одной области: из состояния области — её модель. Хранит последнее
 * тело готового вида, чтобы при переходе держать прежний показ: приглушённый,
 * без управления, с пометкой «Загрузка…». Пустая область и отказ прежний
 * показ сбрасывают. Чистый: ни DOM, ни среды.
 */
export class RegionFrame {
  private readonly forms = new PageFormModel(exampleWebViews.set);
  private readonly controls = new RegionControls(GESTURE_ACTIONS);
  private readonly freezer = new BodyFreeze();
  private held: { body: ScreenBody; revision: number | undefined } | undefined;

  next(state: PageViewState): RegionModel {
    const screen = RegionFrame.screenOf(state);
    const forms = this.forms.of(state);
    const shown = this.shown(state, forms);
    const busy =
      state.stale === 'offline' ||
      state.expected === true ||
      (state.status === 'loading' && shown !== undefined);
    return {
      status: state.status,
      ...(screen === undefined ? {} : { screen }),
      title: screen === undefined ? '' : RegionFrame.titleOf(screen),
      marks: RegionFrame.marks(state),
      busy,
      ...(state.note === undefined ? {} : { note: state.note }),
      issues: forms.general,
      ...(state.confirm === undefined ? {} : { confirm: state.confirm }),
      retry: state.status === 'refused',
      ...(state.status === 'refused' && state.view?.refusal !== undefined
        ? { refusal: state.view.refusal.text }
        : {}),
      ...(shown?.revision === undefined ? {} : { revision: shown.revision }),
      ...(shown === undefined
        ? {}
        : { body: busy ? this.freezer.freeze(shown.body) : shown.body }),
    };
  }

  /** Тело и ревизия для показа; обновляет прежний показ по статусу. */
  private shown(
    state: PageViewState,
    forms: PageFormSet,
  ): { body: ScreenBody; revision: number | undefined } | undefined {
    const view = state.view;
    if (state.status === 'ready' && view !== undefined) {
      const screen = exampleWebViews.findScreen(view.screen);
      this.held =
        screen === undefined
          ? undefined
          : {
              body: screen.body(view, this.controls.of(forms)),
              revision: view.revision,
            };
      return this.held;
    }
    if (state.status === 'loading') return this.held;
    this.held = undefined;
    return undefined;
  }

  /** Экран области: готовый вид — по виду, загрузка — по адресу цели. */
  private static screenOf(state: PageViewState): string | undefined {
    return state.status === 'loading'
      ? state.address?.screen
      : state.view?.screen;
  }

  private static titleOf(screen: string): string {
    return exampleWebViews.findScreen(screen)?.def.label ?? '';
  }

  private static marks(state: PageViewState): RegionMark[] {
    const marks: RegionMark[] = [];
    if (state.stale === 'offline') marks.push(MARK_TEXTS.offline);
    if (state.expected === true) marks.push(MARK_TEXTS.expecting);
    if (state.refreshing) marks.push(MARK_TEXTS.refreshing);
    if (state.status === 'loading') marks.push(MARK_TEXTS.loading);
    return marks;
  }
}
