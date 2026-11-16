import type { SourceFile } from './source-tree';
import type { Violation } from './violation.types';

/** Поиск слов канала (сообщение, кнопка, страница, URL, мессенджеры) в ядре: текст режется на слова, сравнение по целым словам. */
export class ChannelWordScanner {
  /** Латинские слова: токен равен слову, допускается множественное `s`/`es`. Расширяется решением в `decisions` пакета. */
  protected static readonly EXACT = [
    'button',
    'page',
    'url',
    'uri',
    'href',
    'http',
    'https',
    'webhook',
    'deeplink',
    'telegram',
    'slack',
    'whatsapp',
    'discord',
    'tg',
    'chat',
    'bot',
    'chatbot',
  ];

  /** Русские слова: токен равен слову с падежным окончанием (бот, бота, ботов). */
  protected static readonly EXACT_RU = ['бот', 'чат'];

  /** Русские основы: токен начинается с основы (сообщение, кнопок, страницу, телеграмм). */
  protected static readonly STEMS = [
    'сообщени',
    'кнопк',
    'кнопок',
    'страниц',
    'телеграм',
  ];

  protected static readonly TOKEN =
    /\p{Lu}{2,}s?(?!\p{Ll})|\p{Lu}?\p{Ll}+|\p{Lu}+/gu;

  protected static readonly EXACT_PATTERN = new RegExp(
    `^(?:${ChannelWordScanner.EXACT.join('|')})(?:s|es)?$|^(?:${ChannelWordScanner.EXACT_RU.join('|')})(?:а|у|ом|е|ы|ов|ам|ами|ах)?$`,
  );

  /** Нарушение на каждую строку, где есть слово канала. */
  scan(files: SourceFile[]): Violation[] {
    const found: Violation[] = [];
    for (const file of files) {
      file.lines().forEach((text, index) => {
        if (this.hasChannelWord(text)) {
          found.push({ file: file.path, line: index + 1, text: text.trim() });
        }
      });
    }
    return found;
  }

  protected hasChannelWord(line: string): boolean {
    return (line.match(ChannelWordScanner.TOKEN) ?? []).some((token) =>
      this.isChannelWord(token.toLowerCase()),
    );
  }

  protected isChannelWord(word: string): boolean {
    return (
      ChannelWordScanner.EXACT_PATTERN.test(word) ||
      ChannelWordScanner.STEMS.some((stem) => word.startsWith(stem))
    );
  }
}
