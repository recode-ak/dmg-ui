import type {
  PageRegionPresenter,
  PageViewState,
  ViewSource,
} from 'dmg-ui/web-ui';
import type { RegionModel } from '../view/region-model.types';
import { BodyDom } from './body-dom';
import { CLIENT_TEXTS } from './client-texts.const';
import { h } from './dom-element';
import { FocusKeeper } from './focus-keeper';
import type { RegionDomSpec } from './region-dom.types';

/**
 * Показ одной области: на каждое состояние модель считает `RegionFrame`, тело
 * области пересоздаётся целиком. Ввод в полях хранят черновики, фокус
 * возвращается по ключу. Цель — любой элемент.
 */
export class RegionDom implements PageRegionPresenter<HTMLElement> {
  private readonly body: BodyDom;
  private readonly focus = new FocusKeeper();
  private target: HTMLElement | undefined;
  private last: RegionModel | undefined;

  constructor(private readonly spec: RegionDomSpec) {
    this.body = new BodyDom({
      name: spec.name,
      gestures: spec.gestures,
      drafts: spec.drafts,
      drag: spec.drag,
      redraw: () => this.draw(),
    });
  }

  show(source: ViewSource<PageViewState>, target: HTMLElement): () => void {
    this.target = target;
    return source.subscribe((state) => {
      this.last = this.spec.frame.next(state);
      this.draw();
      this.spec.onModel?.(this.last);
    });
  }

  /** Перерисовать последнюю модель (например, после «забыть черновики»). */
  private draw(): void {
    const { target, last: model } = this;
    if (target === undefined || model === undefined) return;
    this.focus.capture(target);
    target.classList.toggle('busy', model.busy);
    target.setAttribute('aria-busy', String(model.busy));
    target.replaceChildren(...this.parts(model));
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
      ...this.body.build(model),
    ];
  }
}
