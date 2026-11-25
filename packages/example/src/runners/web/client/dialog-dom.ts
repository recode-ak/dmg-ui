import type { RegionModel } from '../../../frontend/web-kit/region-model.types';
import { h } from './dom-element';

/**
 * Окно `<dialog>` для модальной области: открыто, пока область не пуста.
 * Esc и щелчок по фону закрывают область через `close`; закрытие самим
 * клиентом (область опустела) событий окна не вызывает — второго закрытия нет.
 * Фокус и его возврат на кнопку «Открыть» даёт браузер.
 */
export class DialogDom {
  /** Куда область строит своё тело: внутри окна, без отступов окна (фон — сам `dialog`). */
  readonly body: HTMLElement;

  constructor(
    private readonly dialog: HTMLDialogElement,
    close: () => void,
  ) {
    this.body = h('div', { class: 'dialog-body' });
    dialog.replaceChildren(this.body);
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      close();
    });
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) close();
    });
  }

  /** Согласовать окно с моделью области. */
  sync(model: RegionModel): void {
    if (model.status === 'empty') {
      if (this.dialog.open) this.dialog.close();
    } else if (!this.dialog.open) {
      this.dialog.showModal();
    }
  }
}
