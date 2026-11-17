import { ScreenComposer } from '../view/screen-composer';
import type { ViewMessage } from '../view/view.types';
import { Sha256 } from './sha256';

/**
 * Отпечаток показанного вида (D-UI-46): SHA-256 (hex) канонического JSON
 * сообщений показа по порядку — фрагменты текста (строка, стили, ссылка) и
 * варианты (вид, имя цели, подпись), массивами без ключей. Лишние поля
 * (ссылки вариантов, заметка перед видом, ключ истории) не входят. Хэш —
 * `Sha256`.
 */
export class ScreenFingerprint {
  private constructor(private readonly messages: readonly ViewMessage[]) {}

  /** 64 знака hex. */
  static async of(messages: readonly ViewMessage[]): Promise<string> {
    return Sha256.hex(new ScreenFingerprint(messages).canonical());
  }

  private canonical(): string {
    return JSON.stringify(
      this.messages.map((message) => [
        message.text.map((fragment) => [
          fragment.text,
          fragment.styles,
          fragment.link ?? null,
        ]),
        message.options.map((option) => [
          option.kind,
          ScreenComposer.target(option) ?? null,
          option.label,
        ]),
      ]),
    );
  }
}
