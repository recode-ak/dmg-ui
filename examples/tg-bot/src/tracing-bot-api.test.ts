import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { MemoryLogger, useTempDir } from 'dmg-core/testing';
import type { BotApi, SendMessageParams } from 'dmg-ui/tg-bot';
import { MemoryBotApi } from 'dmg-ui/tg-bot/testing';
import { TracingBotApi } from './tracing-bot-api';

// Трасса исходящих вызовов (D-UI-68): декоратор порта, который дописывает по
// строке JSONL на вызов, если задан путь файла. Данные людей идут только в
// файл — ни в логгер, ни в консоль (ERR-07).

const CHAT = 7350001234;
const TEXT = 'секретный текст человека';
const SEND: SendMessageParams = {
  chat_id: CHAT,
  text: TEXT,
  reply_markup: {
    inline_keyboard: [[{ text: 'Дальше', callback_data: 'a1' }]],
  },
};

const tmp = useTempDir('example-trace-');

/** Строки трассы как объекты. */
const lines = (path: string): Record<string, unknown>[] =>
  readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as Record<string, unknown>);

const build = (path: string | undefined) => {
  const inner = new MemoryBotApi();
  const logger = new MemoryLogger();
  const api: BotApi = new TracingBotApi({
    api: inner,
    ...(path !== undefined ? { path } : {}),
    logger,
  });
  return { inner, logger, api };
};

describe('TracingBotApi — без пути', () => {
  test('вызов проходит в обёрнутый порт, ответ возвращается как есть, файлов нет', async () => {
    const { inner, api } = build(undefined);

    const outcome = await api.sendMessage(SEND);

    expect(inner.journal).toEqual([{ method: 'sendMessage', params: SEND }]);
    expect(outcome).toMatchObject({ ok: true });
    expect(readdirSync(tmp().path)).toEqual([]);
  });

  test('восемь методов порта проходят в обёрнутый порт со своими параметрами', async () => {
    const { inner, api } = build(undefined);

    await api.sendMessage(SEND);
    await api.editMessageText({ chat_id: CHAT, message_id: 1, text: 'Правка' });
    await api.editMessageReplyMarkup({ chat_id: CHAT, message_id: 1 });
    await api.answerCallbackQuery({ callback_query_id: 'cq1' });
    await api.setMyCommands({ commands: [] });
    await api.banChatMember({ chat_id: -1001, user_id: 42 });
    await api.unbanChatMember({ chat_id: -1001, user_id: 42 });
    await api.approveChatJoinRequest({ chat_id: -1001, user_id: 42 });

    expect(inner.journal.map((call) => call.method)).toEqual([
      'sendMessage',
      'editMessageText',
      'editMessageReplyMarkup',
      'answerCallbackQuery',
      'setMyCommands',
      'banChatMember',
      'unbanChatMember',
      'approveChatJoinRequest',
    ]);
  });
});

describe('TracingBotApi — с путём', () => {
  test('по строке JSONL на вызов: метод, параметры, итог ok', async () => {
    const path = tmp().file('trace.jsonl');
    const { api } = build(path);

    await api.sendMessage(SEND);
    await api.answerCallbackQuery({ callback_query_id: 'cq1' });

    expect(lines(path)).toEqual([
      { method: 'sendMessage', params: SEND, ok: true },
      {
        method: 'answerCallbackQuery',
        params: { callback_query_id: 'cq1' },
        ok: true,
      },
    ]);
  });

  test('отказ Bot API: запись с ok: false и error_code, вызывающий получает отказ без изменений', async () => {
    const path = tmp().file('trace.jsonl');
    const { inner, api } = build(path);
    inner.failNext({
      error_code: 403,
      description: 'Forbidden: bot was blocked',
    });

    const outcome = await api.sendMessage(SEND);

    expect(outcome).toEqual({
      ok: false,
      error_code: 403,
      description: 'Forbidden: bot was blocked',
    });
    expect(lines(path)).toEqual([
      { method: 'sendMessage', params: SEND, ok: false, error_code: 403 },
    ]);
  });

  test('неизвестный каталог создаётся', async () => {
    const path = tmp().file('нет', 'такого', 'trace.jsonl');
    const { api } = build(path);

    await api.sendMessage(SEND);

    expect(lines(path)).toHaveLength(1);
  });

  test('запись дописывается к существующему файлу, а не затирает его', async () => {
    const path = tmp().file('trace.jsonl');
    writeFileSync(path, '{"method":"old","params":{},"ok":true}\n');
    const { api } = build(path);

    await api.sendMessage(SEND);

    expect(lines(path).map((line) => line.method)).toEqual([
      'old',
      'sendMessage',
    ]);
  });

  test('успешная трасса не пишет в логгер: данные людей — только в файл', async () => {
    const { logger, api } = build(tmp().file('trace.jsonl'));

    await api.sendMessage(SEND);

    expect(logger.records).toEqual([]);
  });

  test('бросок обёрнутого порта идёт наружу как есть', async () => {
    const { inner, api } = build(tmp().file('trace.jsonl'));
    const failure = new Error('сбой транспорта');
    inner.throwNext(failure);

    await expect(api.sendMessage(SEND)).rejects.toBe(failure);
  });
});

describe('TracingBotApi — ошибка записи', () => {
  test('файл не записать: вызов не ломается, в логе warn без данных людей', async () => {
    // Путь «внутри» обычного файла: каталог создать нельзя.
    const blocker = tmp().file('file.txt');
    writeFileSync(blocker, 'не каталог');
    const path = `${blocker}/trace.jsonl`;
    const { inner, logger, api } = build(path);

    const outcome = await api.sendMessage(SEND);

    expect(outcome).toMatchObject({ ok: true });
    expect(inner.journal).toHaveLength(1);
    expect(existsSync(path)).toBe(false);
    expect(logger.records.some((record) => record.level === 'warn')).toBe(true);
    const dump = JSON.stringify(logger.records);
    expect(dump).not.toContain(TEXT);
    expect(dump).not.toContain(String(CHAT));
  });

  test('после сбоя записи следующие вызовы по-прежнему проходят', async () => {
    const blocker = tmp().file('file.txt');
    writeFileSync(blocker, 'не каталог');
    const { inner, api } = build(`${blocker}/trace.jsonl`);

    await api.sendMessage(SEND);
    await api.sendMessage(SEND);

    expect(inner.journal).toHaveLength(2);
  });
});
