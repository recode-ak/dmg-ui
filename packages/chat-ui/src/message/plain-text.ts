import type { FormattedText } from './message.types';

/**
 * Видимый текст сообщения (D-UI-35): то, что прочтёт собеседник. Подпись
 * ссылки остаётся, адрес нет; по нему меряют длину и пишут журнал.
 */
export class PlainText {
  private constructor(private readonly text: FormattedText) {}

  /** Сцепка текстов фрагментов. */
  static of(text: FormattedText): string {
    return new PlainText(text).join();
  }

  private join(): string {
    return this.text.map((fragment) => fragment.text).join('');
  }
}
