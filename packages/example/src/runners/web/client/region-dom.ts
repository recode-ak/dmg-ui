import type {
  PageRegionPresenter,
  PageViewState,
  ViewSource,
} from 'dmg-ui/web-ui';
import type {
  HelpModel,
  RegionModel,
} from '../../../frontend/web-kit/region-model.types';
import { HELP_TEXTS } from '../../../frontend/web-kit/view-texts.const';
import { ControlIds } from '../view/control-ids';
import { BodyDom } from './body-dom';
import { CLIENT_TEXTS } from './client-texts.const';
import { h } from './dom-element';
import { FocusKeeper } from './focus-keeper';
import type { RegionDomSpec } from './region-dom.types';

/**
 * Показ одной области: на каждое состояние модель считает `RegionFrame`, тело
 * области пересоздаётся целиком. Ввод в полях хранят черновики, фокус
 * возвращается по ключу; начальный фокус экрана — из модели (`focus`). Цель —
 * любой элемент. Справка: кнопка в шапке и блок
 * из модели; «открыто» решает кадр (`toggleHelp`), а область после щелчка
 * заново считает модель из последнего состояния — старую не рисует.
 */
export class RegionDom implements PageRegionPresenter<HTMLElement> {
  private readonly body: BodyDom;
  private readonly focus = new FocusKeeper();
  private target: HTMLElement | undefined;
  private state: PageViewState | undefined;
  private last: RegionModel | undefined;
  /** Модель, чей начальный фокус уже поставлен: перерисовка его не повторяет. */
  private focused: RegionModel | undefined;

  constructor(private readonly spec: RegionDomSpec) {
    this.body = new BodyDom({
      name: spec.name,
      gestures: spec.gestures,
      drafts: spec.drafts,
      drag: spec.drag,
      redraw: () => this.draw(),
      focus: (key) => this.focus.want(key),
    });
  }

  show(source: ViewSource<PageViewState>, target: HTMLElement): () => void {
    this.target = target;
    return source.subscribe((state) => {
      this.state = state;
      this.refresh(state);
    });
  }

  /** Новая модель из состояния: показать и сообщить. */
  private refresh(state: PageViewState): void {
    const model = this.spec.frame.next(state);
    this.last = model;
    this.draw();
    this.spec.onModel?.(model);
  }

  /** Щелчок «Справка»: решает кадр, модель — заново из последнего состояния. */
  private toggleHelp(): void {
    this.spec.frame.toggleHelp();
    if (this.state !== undefined) this.refresh(this.state);
  }

  /** Перерисовать последнюю модель (например, после «забыть черновики»). */
  private draw(): void {
    const { target, last: model } = this;
    if (target === undefined || model === undefined) return;
    this.focus.capture(target);
    target.classList.toggle('busy', model.busy);
    target.setAttribute('aria-busy', String(model.busy));
    target.replaceChildren(...this.parts(model));
    if (model.focus !== undefined && this.focused !== model) {
      this.focused = model;
      this.focus.want(model.focus);
    }
    this.focus.restore(target);
  }

  private parts(model: RegionModel): HTMLElement[] {
    if (model.status === 'empty') {
      return [
        ...(model.note === undefined
          ? []
          : [h('p', { class: 'note', text: model.note })]),
        ...(this.spec.placeholder === undefined
          ? []
          : [h('p', { class: 'placeholder', text: this.spec.placeholder })]),
      ];
    }
    const { close, gestures, name } = this.spec;
    return [
      h('div', { class: 'region-head' }, [
        h('h2', { text: model.title }),
        this.helpButton(model.help),
        close === undefined
          ? undefined
          : h('button', {
              type: 'button',
              text:
                name === 'side' ? CLIENT_TEXTS.closePanel : CLIENT_TEXTS.close,
              data: { 'focus-key': 'region-close' },
              click: close,
            }),
      ]),
      ...(model.marks.length === 0
        ? []
        : [
            h(
              'div',
              { class: 'marks' },
              model.marks.map((mark) =>
                h('span', { class: 'mark', text: mark }),
              ),
            ),
          ]),
      ...(model.note === undefined
        ? []
        : [h('p', { class: 'note', text: model.note })]),
      ...(model.issues.length === 0
        ? []
        : [
            h(
              'ul',
              { class: 'issues' },
              model.issues.map((issue) => h('li', { text: issue })),
            ),
          ]),
      ...(model.confirm === undefined
        ? []
        : [
            h('div', { class: 'confirm' }, [
              h('p', { class: 'confirm-label', text: model.confirm.label }),
              h('p', { text: model.confirm.description }),
              h('button', {
                type: 'button',
                text: CLIENT_TEXTS.confirm,
                disabled: model.busy,
                data: { 'focus-key': 'confirm' },
                click: () => {
                  void gestures.confirm(name);
                },
              }),
            ]),
          ]),
      ...(model.refusal === undefined
        ? []
        : [h('p', { class: 'refusal', text: model.refusal })]),
      ...(model.retry
        ? [
            h('button', {
              type: 'button',
              text: CLIENT_TEXTS.retry,
              data: { 'focus-key': 'retry' },
              click: () => {
                void gestures.retry(name);
              },
            }),
          ]
        : []),
      ...(model.help?.open === true ? [this.helpBlock(model.help)] : []),
      ...this.body.build(model),
    ];
  }

  /** Кнопка «Справка»; у модели без справки — нет. */
  private helpButton(help: HelpModel | undefined): HTMLElement | undefined {
    if (help === undefined) return undefined;
    return h('button', {
      type: 'button',
      text: HELP_TEXTS.button,
      data: { 'focus-key': 'help' },
      aria: {
        expanded: String(help.open),
        ...(help.open ? { controls: ControlIds.sheet(this.spec.name) } : {}),
      },
      click: () => this.toggleHelp(),
    });
  }

  /** Блок справки: заголовок и подсказка абзацами, разделы — списками. */
  private helpBlock(help: HelpModel): HTMLElement {
    return h(
      'section',
      { class: 'help', id: ControlIds.sheet(this.spec.name) },
      [
        h('p', { class: 'help-title', text: help.title }),
        ...(help.hint === undefined ? [] : [h('p', { text: help.hint })]),
        ...help.sections.flatMap((section) => [
          h('h3', { text: section.heading }),
          h(
            'ul',
            {},
            section.lines.map((line) => h('li', { text: line })),
          ),
        ]),
      ],
    );
  }
}
