import type { ViewMessage, ViewOption } from '../view/view.types';

/**
 * Отпечаток показанного вида (D-UI-46): SHA-256 (hex) канонического JSON
 * сообщений показа по порядку — фрагменты текста (строка, стили, ссылка) и
 * варианты (вид, имя цели, подпись), массивами без ключей. Лишние поля
 * (ссылки вариантов, заметка перед видом, ключ истории) не входят. Хэш —
 * глобальный `crypto.subtle`.
 */
export class ScreenFingerprint {
  private constructor(private readonly messages: readonly ViewMessage[]) {}

  /** 64 знака hex. */
  static async of(messages: readonly ViewMessage[]): Promise<string> {
    return new ScreenFingerprint(messages).digest();
  }

  private async digest(): Promise<string> {
    const bytes = new TextEncoder().encode(this.canonical());
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    return Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join(
      '',
    );
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
          ScreenFingerprint.target(option),
          option.label,
        ]),
      ]),
    );
  }

  /** Имя цели варианта; у «Назад», «Повторить», «В начало» имени нет. */
  private static target(option: ViewOption): string | null {
    switch (option.kind) {
      case 'action':
      case 'local':
        return option.name;
      case 'back':
      case 'retry':
      case 'home':
        return null;
      default: {
        const unknownKind: never = option;
        throw new Error(
          `ScreenFingerprint: неизвестный вид варианта ${(unknownKind as ViewOption).kind}`,
        );
      }
    }
  }
}
