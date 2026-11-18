import { h } from './dom-element';

/**
 * Раскладка страницы, добавленная в корень: строка состояния («Подключение…»,
 * отказ первой загрузки), основная и соседняя области, окно и входящие.
 * Остальное содержимое корня (шапка, навигация) принадлежит разметке страницы.
 */
export class PageLayout {
  readonly notice = h('p', { class: 'notice' });
  readonly main = h('section', { class: 'region region-main' });
  readonly side = h('section', { class: 'region region-side' });
  readonly modal = h('dialog', { class: 'region-modal' });
  readonly inbox = h('section', { class: 'inbox' });

  constructor(root: HTMLElement) {
    root.append(
      h('main', { class: 'example-app' }, [
        this.notice,
        h('div', { class: 'regions' }, [this.main, this.side]),
        this.inbox,
        this.modal,
      ]),
    );
  }

  /** Показать строку состояния; пустая строка — убрать. */
  say(text: string, ...extra: HTMLElement[]): void {
    this.notice.replaceChildren(...(text === '' ? [] : [text]), ...extra);
  }
}
