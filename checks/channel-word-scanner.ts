import type { SourceFile } from './source-tree';
import type { Violation } from './violation.types';

/** Поиск слов канала (сообщение, кнопка, страница, URL, мессенджеры) в ядре: текст режется на слова, сравнение по целым словам. */
export class ChannelWordScanner {
  /** Точные слова. Расширяется решением в `decisions` пакета. */
  protected static readonly WORDS = new Set([
    'button',
    'page',
    'pages',
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
    'chats',
    'бот',
    'бота',
    'боту',
    'ботом',
    'боте',
    'боты',
    'ботов',
    'ботам',
    'ботами',
    'ботах',
  ]);

  /** Русские основы: слово начинается с основы (сообщение, кнопку, страницу, чата, телеграмм). */
  protected static readonly STEMS = [
    'сообщен',
    'кнопк',
    'страниц',
    'чат',
    'телеграм',
  ];

  protected static readonly SPLIT =
    /(?<=[\p{Ll}\p{N}])(?=\p{Lu})|(?<=\p{Lu})(?=\p{Lu}\p{Ll})/u;

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
    return (line.match(/[\p{L}\p{N}]+/gu) ?? [])
      .flatMap((chunk) => chunk.split(ChannelWordScanner.SPLIT))
      .map((word) => word.toLowerCase())
      .some((word) => this.isChannelWord(word));
  }

  protected isChannelWord(word: string): boolean {
    return (
      ChannelWordScanner.WORDS.has(word) ||
      ChannelWordScanner.STEMS.some((stem) => word.startsWith(stem))
    );
  }
}
