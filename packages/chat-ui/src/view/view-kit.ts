import type { FormattedText } from '../message/message.types';
import { TextBuilder } from '../message/text-builder';
import type { MessengerCapabilities } from '../messenger/messenger.types';
import type { ViewMessage, ViewOption } from './view.types';

/**
 * Набор показа — что представление получает кроме вида: возможности
 * мессенджера (уложиться в лимиты — решать представлению) и варианты по
 * умолчанию. Набор строит сборщик показа на каждый показ.
 */
export class ViewKit {
  /**
   * @param options доступные действия, затем локальные (подписи из Def),
   *   затем «Назад», если путь не пуст.
   */
  constructor(
    readonly capabilities: MessengerCapabilities,
    readonly options: readonly ViewOption[],
  ) {}

  /** Одно сообщение; строка — без стилей; варианты по умолчанию, если не заданы. */
  message(
    text: string | FormattedText,
    options: readonly ViewOption[] = this.options,
  ): ViewMessage {
    return {
      kind: 'text',
      text: typeof text === 'string' ? TextBuilder.of(text) : text,
      options,
    };
  }
}
