import type { SourceFile } from './source-tree';
import type { Violation } from './violation.types';

/** Списки слов сканера: латинские, русские точные и русские основы. */
export type ChannelWords = {
  exact: string[];
  exactRu: string[];
  stems: string[];
};

/** Поиск слов канала в тексте: текст режется на слова, сравнение по целым словам. Без аргумента — список ядра (сообщение, кнопка, страница, URL, мессенджеры); `chatUi()` — список пакета диалогового канала (слова конкретного мессенджера и его API). */
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

  /** Слова пакета диалогового канала: конкретный мессенджер и поля его API; общие слова (сообщение, кнопка, чат, бот) разрешены. */
  protected static readonly CHAT_UI: ChannelWords = {
    exact: [
      'telegram',
      'tg',
      'whatsapp',
      'slack',
      'discord',
      'viber',
      'grammy',
      'telegraf',
      'baileys',
      'twilio',
      'webhook',
      'keyboard',
      'markup',
      'mrkdwn',
    ],
    exactRu: [],
    stems: ['телеграм', 'ватсап', 'вотсап', 'слак', 'клавиатур'],
  };

  protected static readonly TOKEN =
    /\p{Lu}{2,}s?(?!\p{Ll})|\p{Lu}?\p{Ll}+|\p{Lu}+/gu;

  protected readonly exactPattern: RegExp;

  constructor(
    protected readonly words: ChannelWords = {
      exact: ChannelWordScanner.EXACT,
      exactRu: ChannelWordScanner.EXACT_RU,
      stems: ChannelWordScanner.STEMS,
    },
  ) {
    const latin = `^(?:${words.exact.join('|')})(?:s|es)?$`;
    const russian = `^(?:${words.exactRu.join('|')})(?:а|у|ом|е|ы|ов|ам|ами|ах)?$`;
    this.exactPattern = new RegExp(
      words.exactRu.length > 0 ? `${latin}|${russian}` : latin,
    );
  }

  /** Сканер со списком слов пакета `chat-ui`. */
  static chatUi(): ChannelWordScanner {
    return new ChannelWordScanner(ChannelWordScanner.CHAT_UI);
  }

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
      this.exactPattern.test(word) ||
      this.words.stems.some((stem) => word.startsWith(stem))
    );
  }
}
