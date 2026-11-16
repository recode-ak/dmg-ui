/** В чём меряет лимит мессенджер (D-UI-36). */
export type LengthUnit = 'grapheme' | 'codePoint' | 'utf16' | 'utf8';

/** Лимит длины видимого текста: предел и единица, в которой он задан. */
export type TextLimit = { readonly max: number; readonly unit: LengthUnit };

/** Разрез при разбиении: граница конца части и граница начала следующей (после снятого разделителя). */
export type SplitCut = { readonly end: number; readonly next: number };
