/** Положение курсора в текстовом поле. */
type Caret = { readonly start: number | null; readonly end: number | null };

/**
 * Фокус переживает пересоздание тела области: до — запоминается ключ
 * сфокусированного элемента (`data-focus-key`) и курсор текстового поля,
 * после — фокус возвращается элементу с тем же ключом. Заказанный ключ
 * (`want`) важнее запомненного и действует на одно восстановление.
 */
export class FocusKeeper {
  private key: string | undefined;
  private caret: Caret | undefined;
  private wanted: string | undefined;

  /** Поставить фокус на элемент с ключом при следующем восстановлении. */
  want(key: string): void {
    this.wanted = key;
  }

  /** Запомнить фокус внутри `target`; вне него — ничего. */
  capture(target: HTMLElement): void {
    this.key = undefined;
    this.caret = undefined;
    const active = target.ownerDocument.activeElement;
    if (!(active instanceof HTMLElement) || !target.contains(active)) return;
    this.key = active.dataset.focusKey;
    if (active instanceof HTMLInputElement && active.type === 'text') {
      this.caret = { start: active.selectionStart, end: active.selectionEnd };
    }
  }

  /** Вернуть фокус элементу с запомненным ключом. */
  restore(target: HTMLElement): void {
    const wanted = this.wanted;
    this.wanted = undefined;
    const key = wanted ?? this.key;
    if (key === undefined) return;
    for (const element of target.querySelectorAll<HTMLElement>(
      '[data-focus-key]',
    )) {
      if (element.dataset.focusKey !== key) continue;
      element.focus();
      if (
        wanted === undefined &&
        element instanceof HTMLInputElement &&
        this.caret !== undefined
      ) {
        element.setSelectionRange(this.caret.start, this.caret.end);
      }
      return;
    }
  }
}
