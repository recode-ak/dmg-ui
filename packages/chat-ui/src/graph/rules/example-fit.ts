import type { Message } from '../../message/message.types';
import { MessageFit } from '../../messenger/message-fit';
import type {
  LimitCut,
  MessengerCapabilities,
} from '../../messenger/messenger.types';
import { UNLIMITED_OPTIONS } from './example-limits.const';

/**
 * Мера сообщения примера для CH-01: подгонка стража (`MessageFit`), своей
 * арифметики лимитов нет. Показ экрана — с лимитом числа вариантов, снятым
 * до `UNLIMITED_OPTIONS` (варианты раскладывает беседа); уведомление — с
 * настоящим `options.max` (ссылки беседа не раскладывает, лишние отбросит
 * страж). Разрезы — то, что страж обрезал бы.
 */
export class ExampleFit {
  private constructor(private readonly fit: MessageFit) {}

  /** Мера сообщения показа экрана: число вариантов не меряется. */
  static screen(capabilities: MessengerCapabilities): ExampleFit {
    return new ExampleFit(
      new MessageFit({
        ...capabilities,
        options: { ...capabilities.options, max: UNLIMITED_OPTIONS },
      }),
    );
  }

  /** Мера сообщения уведомления: лимиты стража целиком, с числом вариантов. */
  static notice(capabilities: MessengerCapabilities): ExampleFit {
    return new ExampleFit(new MessageFit(capabilities));
  }

  /** Разрезы сообщения по порядку: число вариантов, подписи, текст. */
  cuts(message: Message): readonly LimitCut[] {
    return this.fit.message(message).cuts;
  }

  /** Длина и предел разреза: `(<длина> из <предел> <единица>)`. */
  static measure(cut: LimitCut): string {
    const unit = cut.unit === undefined ? '' : ` ${cut.unit}`;
    return `(${cut.length} из ${cut.max}${unit})`;
  }
}
