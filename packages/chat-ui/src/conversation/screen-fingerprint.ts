import type { Accent } from '../message/message.types';
import { ScreenComposer } from '../view/screen-composer';
import type { ViewMessage, ViewOption } from '../view/view.types';
import { Sha256 } from './sha256';

/**
 * Отпечаток показанного вида (D-UI-46): SHA-256 (hex) канонического JSON
 * сообщений показа по порядку — фрагменты текста (строка, стили, ссылка) и
 * варианты (вид, имя цели, подпись), массивами без ключей; момент фрагмента
 * и акцент варианта добавляются в конец, только если они есть —
 * прежние отпечатки не меняются. Лишние поля
 * (ссылки вариантов, заметка перед видом, ключ истории) не входят. Хэш —
 * `Sha256`.
 */
export class ScreenFingerprint {
  private constructor(private readonly messages: readonly ViewMessage[]) {}

  /** 64 знака hex. */
  static async of(messages: readonly ViewMessage[]): Promise<string> {
    return Sha256.hex(new ScreenFingerprint(messages).canonical());
  }

  private static accent(option: ViewOption): Accent | undefined {
    return option.kind === 'action' || option.kind === 'local'
      ? option.accent
      : undefined;
  }

  private canonical(): string {
    return JSON.stringify(
      this.messages.map((message) => [
        message.text.map((fragment) => [
          fragment.text,
          fragment.styles,
          fragment.link ?? null,
          ...(fragment.moment === undefined
            ? []
            : [[fragment.moment.at, fragment.moment.show]]),
        ]),
        message.options.map((option) => [
          option.kind,
          ScreenComposer.target(option) ?? null,
          option.label,
          ...(ScreenFingerprint.accent(option) === undefined
            ? []
            : [ScreenFingerprint.accent(option)]),
        ]),
      ]),
    );
  }
}
