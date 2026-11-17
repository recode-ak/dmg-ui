import { describe, expect, it } from 'bun:test';
import { resolve } from 'node:path';
import { ChannelWordScanner } from './channel-word-scanner';
import { SourceFile, SourceTree } from './source-tree';

// Словарь `chat-ui`: слова конкретного мессенджера и его API. Общие слова
// мессенджеров (сообщение, кнопка, чат, бот) в пакете разрешены.

const ROOT = resolve(import.meta.dir, '..');
const SRC = 'packages/chat-ui/src';

const scan = (text: string, path = `${SRC}/dialog/a.ts`) =>
  ChannelWordScanner.chatUi().scan([SourceFile.of(path, text)]);

describe('ChannelWordScanner.chatUi — в chat-ui нет слов конкретного мессенджера', () => {
  const forbidden = [
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
    'телеграм',
    'ватсап',
    'вотсап',
    'слак',
    'клавиатура',
    'клавиатуру',
  ];

  for (const word of forbidden) {
    it(`слово «${word}» даёт нарушение с файлом и строкой`, () => {
      const found = scan(`export const a = 1;\n// ${word} тут\n`);
      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({ file: `${SRC}/dialog/a.ts`, line: 2 });
      expect(found[0]?.text).toContain(word);
    });
  }

  it('регистр не важен', () => {
    expect(scan('const a = "TELEGRAM";')).toHaveLength(1);
  });

  it('слово внутри camelCase находится', () => {
    expect(scan('const inlineKeyboard = 1;')).toHaveLength(1);
  });

  it('слово внутри snake_case находится', () => {
    expect(scan('const reply_markup = 1;')).toHaveLength(1);
  });

  it('слово в тестовом файле chat-ui срабатывает', () => {
    expect(scan('// slack', `${SRC}/dialog/a.test.ts`)).toHaveLength(1);
  });

  it('несколько строк — по нарушению на строку с номерами', () => {
    const found = scan('// ok\n// tg\n// ok\n// viber\n');
    expect(found.map((v) => v.line)).toEqual([2, 4]);
  });

  for (const allowed of [
    'сообщение',
    'сообщения',
    'кнопка',
    'кнопки',
    'чат',
    'бот',
    'сигнал',
    'мессенджер',
    'message',
    'messages',
    'button',
    'chat',
    'bot',
    'signal',
    'callback',
    'entity',
    'entities',
    'link',
    'emoji',
    'callback_data',
    'accent',
    'moment',
    'primary',
    'positive',
    'danger',
    'dateTime',
    'relative',
    'show',
  ]) {
    it(`разрешённое слово «${allowed}» не срабатывает`, () => {
      expect(scan(`// ${allowed}`)).toEqual([]);
    });
  }

  it('на реальном packages/chat-ui (весь каталог) — ноль нарушений', () => {
    const files = SourceTree.read(ROOT, 'packages/chat-ui');
    expect(files.length).toBeGreaterThan(0);
    expect(ChannelWordScanner.chatUi().scan(files)).toEqual([]);
  });
});
