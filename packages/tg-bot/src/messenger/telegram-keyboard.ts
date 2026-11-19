import { type MessageOption, TextLength } from 'dmg-ui/chat-ui';
import type {
  CallbackButton,
  InlineKeyboardMarkup,
} from '../bot-api/bot-api.types';
import { ACCENT_STYLES, TELEGRAM_LIMITS } from './telegram.const';

/**
 * Инлайн-клавиатура из вариантов сообщения (D-UI-61): по кнопке в строке,
 * `text` — подпись как есть, `callback_data` — ссылка беседы как есть,
 * `style` — из акцента.
 */
export class TelegramKeyboard {
  private static readonly bytes = new TextLength('utf8');

  private constructor(private readonly options: readonly MessageOption[]) {}

  static of(options: readonly MessageOption[]): InlineKeyboardMarkup {
    return new TelegramKeyboard(options).markup();
  }

  /**
   * Каждая ссылка — 1–64 байта UTF-8, как требует Bot API. Ссылки беседы —
   * `[a-z0-9]` до 16 знаков, а страж меряет их в знаках: проверка в байтах —
   * страховка.
   */
  static fits(options: readonly MessageOption[]): boolean {
    return new TelegramKeyboard(options).refsFit();
  }

  private markup(): InlineKeyboardMarkup {
    return {
      inline_keyboard: this.options.map((option) => [this.button(option)]),
    };
  }

  private button(option: MessageOption): CallbackButton {
    const button = {
      text: option.label.toWellFormed(),
      callback_data: option.ref,
    };
    return option.accent === undefined
      ? button
      : { ...button, style: ACCENT_STYLES[option.accent] };
  }

  private refsFit(): boolean {
    return this.options.every((option) => {
      const size = TelegramKeyboard.bytes.ofString(option.ref);
      return size > 0 && size <= TELEGRAM_LIMITS.callbackData;
    });
  }
}
