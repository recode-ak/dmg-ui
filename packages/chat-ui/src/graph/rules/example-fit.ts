import type { Message } from '../../message/message.types';
import { MessageFit } from '../../messenger/message-fit';
import type {
  LimitCut,
  MessengerCapabilities,
} from '../../messenger/messenger.types';
import { UNLIMITED_OPTIONS } from './example-limits.const';

/**
 * Мера сообщения примера для CH-01: подгонка стража (`MessageFit`) с
 * лимитом числа вариантов, снятым до `UNLIMITED_OPTIONS`, — своей
 * арифметики лимитов нет. Разрезы — то, что страж обрезал бы.
 */
export class ExampleFit {
  private readonly fit: MessageFit;

  constructor(capabilities: MessengerCapabilities) {
    this.fit = new MessageFit({
      ...capabilities,
      options: { ...capabilities.options, max: UNLIMITED_OPTIONS },
    });
  }

  /** Разрезы сообщения по порядку: подписи, текст. */
  cuts(message: Message): readonly LimitCut[] {
    return this.fit.message(message).cuts;
  }

  /** Длина и предел разреза: `(<длина> из <предел> <единица>)`. */
  static measure(cut: LimitCut): string {
    const unit = cut.unit === undefined ? '' : ` ${cut.unit}`;
    return `(${cut.length} из ${cut.max}${unit})`;
  }
}
