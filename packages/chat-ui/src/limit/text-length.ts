import type { FormattedText } from '../message/message.types';
import { PlainText } from '../message/plain-text';
import { Graphemes } from './graphemes';
import type { LengthUnit } from './limit.types';

/**
 * Длина текста в единице лимита (D-UI-36). Мера — видимый текст: подпись
 * ссылки считается, адрес нет. Одиночный суррогат в UTF-8 — 3 байта, как U+FFFD.
 */
export class TextLength {
  constructor(private readonly unit: LengthUnit) {}

  /** Длина видимого текста (`PlainText`) в единице. */
  of(text: FormattedText): number {
    return this.ofString(PlainText.of(text));
  }

  /** Длина строки: подпись варианта, ответ на нажатие. */
  ofString(text: string): number {
    switch (this.unit) {
      case 'grapheme':
        return new Graphemes(text).count();
      case 'codePoint':
        return [...text].length;
      case 'utf16':
        return text.length;
      case 'utf8':
        return this.utf8(text);
      default:
        return this.unknownUnit(this.unit);
    }
  }

  private utf8(text: string): number {
    let bytes = 0;
    for (const char of text) bytes += this.utf8Bytes(char.codePointAt(0) ?? 0);
    return bytes;
  }

  private utf8Bytes(codePoint: number): number {
    if (codePoint < 0x80) return 1;
    if (codePoint < 0x800) return 2;
    if (codePoint < 0x10000) return 3;
    return 4;
  }

  /** Единица не по типу (ERR-06): в тексте только единица. */
  private unknownUnit(unit: never): never {
    throw new Error(`неизвестная единица длины: ${String(unit)}`);
  }
}
