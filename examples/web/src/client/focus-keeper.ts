/** Положение курсора в текстовом поле. */
type Caret = { readonly start: number | null; readonly end: number | null };

/**
 * Фокус переживает пересоздание тела области: до — запоминается ключ
 * сфокусированного элемента (`data-focus-key`) и курсор текстового поля,
 * после — фокус возвращается элементу с тем же ключом.
 */
export class FocusKeeper {
  private key: string | undefined;
  private caret: Caret | undefined;

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
    if (this.key === undefined) return;
    for (const element of target.querySelectorAll<HTMLElement>(
      '[data-focus-key]',
    )) {
      if (element.dataset.focusKey !== this.key) continue;
      element.focus();
      if (element instanceof HTMLInputElement && this.caret !== undefined) {
        element.setSelectionRange(this.caret.start, this.caret.end);
      }
      return;
    }
  }
}
