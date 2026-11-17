import {
  type FormattedText,
  PlainText,
  type TextFragment,
  type TextStyle,
} from 'dmg-ui/chat-ui';
import type {
  MessageEntity,
  MessageEntityType,
} from '../bot-api/bot-api.types';
import { LINK_SCHEMES, TELEGRAM_TEXTS } from './telegram.const';
import type { TelegramContent } from './telegram-messenger.types';

/**
 * Форматированный текст → `text` и `entities` Bot API (D-UI-61). Текст —
 * видимый (`PlainText`), одиночный суррогат — U+FFFD (длина в UTF-16 та же,
 * смещения не сдвигаются). Строчные стили и ссылка — на каждый фрагмент
 * отдельно, цитата — одна на непрерывную серию фрагментов: так две сущности
 * либо не пересекаются, либо одна внутри другой (правило вложенности Bot
 * API). Строчный код в цитате отбрасывается: сочетание не сверено с Bot API,
 * доставка важнее стиля. Пустой или из одних пробелов текст — заглушка.
 */
export class TelegramText {
  private readonly entities: MessageEntity[] = [];
  private offset = 0;
  /** Начало открытой серии цитаты. */
  private quoteStart: number | undefined;

  private constructor(private readonly text: FormattedText) {}

  static of(text: FormattedText): TelegramContent {
    return new TelegramText(text).build();
  }

  private build(): TelegramContent {
    const plain = PlainText.of(this.text).toWellFormed();
    if (plain.trim() === '')
      return { text: TELEGRAM_TEXTS.empty, entities: [] };
    for (const fragment of this.text) this.fragment(fragment);
    this.closeQuote();
    return { text: plain, entities: this.sorted() };
  }

  private fragment(fragment: TextFragment): void {
    const length = fragment.text.length;
    if (length === 0) return;
    const quoted = fragment.styles.includes('quote');
    if (quoted && this.quoteStart === undefined) this.quoteStart = this.offset;
    if (!quoted) this.closeQuote();
    for (const style of fragment.styles) {
      const type = TelegramText.entityType(style, quoted);
      if (type !== undefined) this.push(type, this.offset, length);
    }
    if (fragment.link !== undefined && LINK_SCHEMES.test(fragment.link)) {
      this.entities.push({
        type: 'text_link',
        offset: this.offset,
        length,
        url: fragment.link,
      });
    }
    this.offset += length;
  }

  private closeQuote(): void {
    if (this.quoteStart === undefined) return;
    this.push('blockquote', this.quoteStart, this.offset - this.quoteStart);
    this.quoteStart = undefined;
  }

  private push(type: MessageEntityType, offset: number, length: number): void {
    this.entities.push({ type, offset, length });
  }

  /** По смещению, объемлющая раньше вложенной: порядок, в котором их читает собеседник. */
  private sorted(): MessageEntity[] {
    return this.entities.sort(
      (a, b) => a.offset - b.offset || b.length - a.length,
    );
  }

  /** Сущность строчного или блочного стиля; цитата ставится серией, код в цитате — нет. */
  private static entityType(
    style: TextStyle,
    quoted: boolean,
  ): MessageEntityType | undefined {
    switch (style) {
      case 'bold':
        return 'bold';
      case 'italic':
        return 'italic';
      case 'strike':
        return 'strikethrough';
      case 'code':
        return quoted ? undefined : 'code';
      case 'codeBlock':
        return 'pre';
      case 'quote':
        return undefined;
      default:
        // Стиль, которого пакет не знает (новый в `chat-ui`), — без сущности: текст важнее стиля (ERR-06).
        style satisfies never;
        return undefined;
    }
  }
}
