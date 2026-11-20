import { type AnyUiAppDef, type HelpSheet, ScreenHelp } from 'dmg-ui';
import {
  PageFormModel,
  type PageFormSet,
  type PageViewState,
} from 'dmg-ui/web-ui';
import { ExamplePagesUiAppDef } from 'dmg-ui/web-ui/testing';
import { BodyFreeze } from './body-freeze';
import { ControlIds } from './control-ids';
import { exampleWebViews } from './example-web.views';
import { HelpLines } from './help-lines';
import { RegionControls } from './region-controls';
import type { RegionMark, RegionModel, ScreenBody } from './region-model.types';
import { GESTURE_ACTIONS, MARK_TEXTS } from './view-texts.const';

/** Прежний показ: тело, ревизия и лист справки того же вида. */
type Shown = {
  readonly body: ScreenBody;
  readonly revision: number | undefined;
  readonly sheet: HelpSheet;
};

/**
 * Кадр одной области: из состояния области — её модель. Хранит последнее
 * тело готового вида, чтобы при переходе держать прежний показ: приглушённый,
 * без управления, с пометкой «Загрузка…». Пустая область и отказ прежний
 * показ сбрасывают. Справка — тоже решение кадра: лист по виду (`ScreenHelp`),
 * «открыта или закрыта» помнит кадр: открытая остаётся при перерисовке того же
 * экрана и закрывается при смене экрана. Чистый: ни DOM, ни среды.
 */
export class RegionFrame {
  private readonly forms = new PageFormModel(exampleWebViews.set);
  private readonly controls = new RegionControls(GESTURE_ACTIONS);
  private readonly freezer = new BodyFreeze();
  private readonly help: ScreenHelp;
  private held: Shown | undefined;
  private helpOpen = false;
  /** Экран, для которого справка открывалась или показана последний раз. */
  private helpScreen: string | undefined;
  /** Экран, для которого начальный фокус уже решён. */
  private focusScreen: string | undefined;

  /**
   * `app` — приложение, по которому строится справка (то же, что получил
   * `PageClient`), или готовый `ScreenHelp`; по умолчанию — учебное.
   */
  constructor(app: AnyUiAppDef | ScreenHelp = ExamplePagesUiAppDef) {
    this.help = app instanceof ScreenHelp ? app : new ScreenHelp(app);
  }

  /**
   * Открыть справку области или закрыть. Показанной справки нет (пустая
   * область, отказ, первая загрузка) — ничего: открывать нечего.
   */
  toggleHelp(): void {
    if (this.held === undefined) return;
    this.helpOpen = !this.helpOpen;
  }

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
        : {
            body: busy ? this.freezer.freeze(shown.body) : shown.body,
            help: HelpLines.of(shown.sheet, this.helpOpen),
          }),
      ...this.focusOf(state, busy, shown),
    };
  }

  /**
   * Начальный фокус нового экрана: решается один раз на первом готовом
   * неприглушённом кадре — первое поле доступной основной формы или ничего.
   * Пустая область и отказ сбрасывают решённое: экран снова получит фокус.
   */
  private focusOf(
    state: PageViewState,
    busy: boolean,
    shown: Shown | undefined,
  ): { readonly focus?: string } {
    if (state.status !== 'ready' && state.status !== 'loading') {
      this.focusScreen = undefined;
      return {};
    }
    const screen = state.view?.screen;
    if (state.status === 'loading' || busy || shown === undefined) return {};
    if (screen === this.focusScreen) return {};
    this.focusScreen = screen;
    const body = shown.body;
    const forms =
      body.kind === 'list' || body.kind === 'card' ? body.forms : [];
    const form = forms.find((each) => each.primary && each.enabled);
    const field = form?.fields[0];
    return form === undefined || field === undefined
      ? {}
      : { focus: ControlIds.fieldFocus(form.name, field.name) };
  }

  /** Тело и ревизия для показа; обновляет прежний показ по статусу. */
  private shown(state: PageViewState, forms: PageFormSet): Shown | undefined {
    const view = state.view;
    if (state.status === 'ready' && view !== undefined) {
      const screen = exampleWebViews.findScreen(view.screen);
      this.held =
        screen === undefined
          ? undefined
          : {
              body: screen.body(view, this.controls.of(forms)),
              revision: view.revision,
              sheet: this.help.of(view),
            };
      this.keepHelp(this.held === undefined ? undefined : view.screen);
      return this.held;
    }
    if (state.status === 'loading') return this.held;
    this.held = undefined;
    this.keepHelp(undefined);
    return undefined;
  }

  /** Справка открыта только на том экране, где её открыли: смена экрана закрывает. */
  private keepHelp(screen: string | undefined): void {
    if (screen !== this.helpScreen) this.helpOpen = false;
    this.helpScreen = screen;
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
