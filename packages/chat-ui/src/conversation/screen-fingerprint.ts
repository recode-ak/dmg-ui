import { ScreenComposer } from '../view/screen-composer';
import type { ViewMessage } from '../view/view.types';
import { Sha256 } from './sha256';

/**
 * Отпечаток показанного вида (D-UI-46): SHA-256 (hex) канонического JSON
 * сообщений показа — фрагменты (строка, стили, ссылка) и варианты (вид, имя
 * цели, подпись) массивами без ключей. Момент и акцент добавляются в конец,
 * только если есть, — прежние отпечатки не меняются (D-UI-66). Отключённые
 * варианты (`disabled`) в отпечаток не входят: ревизии их ссылки не несут, а
 * прежние отпечатки сохранённых бесед остаются прежними (D-UI-105). У
 * строки (`row`) в конце — значение ключа: строки с одной подписью
 * различаются (D-UI-129).
 * @see screen-fingerprint.test.ts
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
          ...(fragment.moment === undefined
            ? []
            : [[fragment.moment.at, fragment.moment.show]]),
        ]),
        message.options
          .filter((option) => option.kind !== 'disabled')
          .map((option) => {
            const accent = ScreenComposer.accent(option);
            return [
              option.kind,
              ScreenComposer.target(option) ?? null,
              option.label,
              ...(accent === undefined ? [] : [accent]),
              ...(option.kind === 'row' ? [option.value] : []),
            ];
          }),
      ]),
    );
  }
}
