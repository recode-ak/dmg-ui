import type { ShownScreen } from './conversation.types';

/**
 * Отпечаток показанного вида: SHA-256 (hex) канонического JSON — фрагменты
 * текста (строка, стили, ссылка) и варианты (вид, имя цели, подпись) по
 * порядку, массивами без ключей. Лишние поля (ссылки вариантов, заметка
 * перед видом) в отпечаток не входят. Хэш — глобальный `crypto.subtle`.
 */
export class ScreenFingerprint {
  private constructor(private readonly shown: ShownScreen) {}

  /** 64 знака hex. */
  static async of(shown: ShownScreen): Promise<string> {
    return new ScreenFingerprint(shown).digest();
  }

  private async digest(): Promise<string> {
    const bytes = new TextEncoder().encode(this.canonical());
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    return Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join(
      '',
    );
  }

  private canonical(): string {
    const text = this.shown.text.map((fragment) => [
      fragment.text,
      fragment.styles,
      fragment.link ?? null,
    ]);
    const options = this.shown.options.map((option) => [
      option.kind,
      option.name ?? null,
      option.label,
    ]);
    return JSON.stringify([text, options]);
  }
}
