import type { InstanceView } from 'dmg-ui';
import type { Message } from '../../message/message.types';
import type {
  LimitCut,
  MessengerCapabilities,
} from '../../messenger/messenger.types';
import type { ChatViews } from '../../view/chat-views';
import { ScreenComposer } from '../../view/screen-composer';
import type { ViewMessage } from '../../view/view.types';
import { ExampleFit } from './example-fit';
import { STUB_REF } from './example-limits.const';

/**
 * Мера показа экрана для CH-01: показ с «Назад» (худший случай), каждое
 * сообщение — подгонкой стража; номера сообщения и варианта — с 1. Дефект
 * представления — бросок `compose`, строку о нём пишет правило.
 */
export class ScreenLimits {
  private readonly composer: ScreenComposer;
  private readonly fit: ExampleFit;

  constructor(views: ChatViews, capabilities: MessengerCapabilities) {
    this.composer = new ScreenComposer(views, capabilities);
    this.fit = new ExampleFit(capabilities);
  }

  /** Нарушения показа вида — без текста примера и данных вида. */
  check(view: InstanceView): string[] {
    return this.composer
      .compose(view, true)
      .messages.flatMap((message, index) =>
        this.fit
          .cuts(ScreenLimits.message(message))
          .flatMap((cut) => ScreenLimits.line(cut, index + 1)),
      );
  }

  /** Сообщение вида → сообщение порта: подписи вида, ссылки — заглушки. */
  private static message(message: ViewMessage): Message {
    switch (message.kind) {
      case 'text':
        return {
          kind: 'text',
          text: message.text,
          options: message.options.map(({ label }) => ({
            ref: STUB_REF,
            label,
          })),
        };
      default: {
        const unknownKind: never = message.kind;
        throw new Error(
          `ScreenLimits: неизвестный вид сообщения ${unknownKind}`,
        );
      }
    }
  }

  /** Строка разреза сообщения `n`; лимит числа вариантов — не нарушение. */
  private static line(cut: LimitCut, n: number): string[] {
    switch (cut.limit) {
      case 'text':
      case 'textWithOptions':
      case 'pressAnswer':
        return [
          `сообщение ${n} длиннее лимита ${cut.limit} ${ExampleFit.measure(cut)}`,
        ];
      case 'label':
        return [
          `сообщение ${n}, вариант ${(cut.index ?? 0) + 1}: подпись длиннее лимита ${ExampleFit.measure(cut)}`,
        ];
      case 'options':
        return [];
      default: {
        const unknownLimit: never = cut.limit;
        throw new Error(`ScreenLimits: неизвестный лимит ${unknownLimit}`);
      }
    }
  }
}
