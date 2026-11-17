import { describe, expect, test } from 'bun:test';
import { MemoryLogger } from 'dmg-core/testing';
import { MemoryBotApi } from 'dmg-ui/tg-bot/testing';
import { ExampleProbe } from './example-probe';
import { PROBE_CASES } from './example-probe.const';

// Проба Bot API (D-UI-68): набор сообщений в чат человека через настоящий
// `TelegramMessenger` под стражем лимитов (`LimitedMessenger`: режет, не отвергает); таблица `PROBE_CASES` — единственный источник группы Е
// чек-листа. Здесь проба идёт на подставном порту, не на Telegram; согласованность
// с README — в `readme.test.ts`. Идентификаторы проб — `Е1…Е13`: кириллическая
// «Е», как в таблице группы Е чек-листа.

const CHAT = 7350001234;
const CYRILLIC_E = String.fromCharCode(0x415);
const caseId = (n: number): string => `${CYRILLIC_E}${n}`;

const probe = () => {
  const api = new MemoryBotApi();
  const logger = new MemoryLogger();
  return { api, logger, probe: new ExampleProbe({ api, chat: CHAT, logger }) };
};

describe('PROBE_CASES — таблица проб', () => {
  test('тринадцать проб Е1…Е13 по порядку, id не повторяются', () => {
    expect(PROBE_CASES.map((probeCase) => probeCase.id)).toEqual(
      Array.from({ length: 13 }, (_, index) => caseId(index + 1)),
    );
  });

  test('у каждой пробы есть непустое ожидание', () => {
    for (const probeCase of PROBE_CASES) {
      expect(probeCase.expected.trim()).not.toBe('');
    }
  });
});

describe('ExampleProbe — набор на подставном порту', () => {
  test('run(id): у каждой пробы есть вызов — хотя бы одно сообщение в чат человека, первая строка называет пробу', async () => {
    for (const probeCase of PROBE_CASES) {
      const w = probe();

      await w.probe.run(probeCase.id);

      const first = w.api.journal.find((call) => call.method === 'sendMessage');
      expect(first?.params).toMatchObject({ chat_id: CHAT });
      const text =
        first?.method === 'sendMessage' ? first.params.text : undefined;
      const firstLine = text?.split('\n')[0];
      expect(firstLine).toContain(probeCase.id);
    }
  });

  test('весь набор доставлен: сообщения в каждой пробе есть, недоставленных нет', async () => {
    const w = probe();

    const results = await w.probe.runAll();

    expect(results.map((result) => result.id)).toEqual(
      PROBE_CASES.map((probeCase) => probeCase.id),
    );
    for (const result of results) {
      expect({ id: result.id, failed: result.failed }).toEqual({
        id: result.id,
        failed: 0,
      });
      expect(result.sent).toBeGreaterThanOrEqual(1);
    }
  });

  test('страж лимитов режет, а не отвергает: единственная запись error — лишние кнопки пробы «100 и 101 кнопка»', async () => {
    const w = probe();

    await w.probe.runAll();

    const errors = w.logger.records.filter((r) => r.level === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.meta).toMatchObject({ limit: 'options', max: 100 });
  });

  test('«100 и 101 кнопка»: ни в одном сообщении не больше ста кнопок, сообщение со ста есть', async () => {
    const w = probe();

    await w.probe.run(caseId(9));

    const buttons = w.api.journal.flatMap((call) =>
      call.method === 'sendMessage'
        ? [call.params.reply_markup?.inline_keyboard.flat().length ?? 0]
        : [],
    );
    expect(Math.max(...buttons)).toBe(100);
  });

  test('«4096 и 4097 знаков»: есть сообщение ровно в 4096 знаков, длиннее не уходит', async () => {
    const w = probe();

    await w.probe.run(caseId(13));

    const lengths = w.api.journal.flatMap((call) =>
      call.method === 'sendMessage' ? [call.params.text.length] : [],
    );
    expect(lengths).toContain(4096);
    expect(lengths.every((length) => length <= 4096)).toBe(true);
  });
});

describe('ExampleProbe — проба «ушедший экран» (Е7)', () => {
  test('после retire уходит editMessageReplyMarkup с одной отключённой кнопкой без callback_data', async () => {
    const w = probe();
    await w.probe.run(caseId(7));
    const sent = w.api.journal.filter((call) => call.method === 'sendMessage');
    const live = sent[0]?.params.reply_markup?.inline_keyboard.flat();
    expect(live?.some((button) => 'callback_data' in button)).toBe(true);

    await w.probe.retire(caseId(7));

    const edit = w.api.journal.at(-1);
    expect(edit?.method).toBe('editMessageReplyMarkup');
    expect(edit?.params).toMatchObject({
      chat_id: CHAT,
      message_id: w.api.chat(CHAT)[0]?.message_id,
    });
    const buttons = w.api.chat(CHAT)[0]?.keyboard.flat() ?? [];
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveProperty('disabled');
    expect(buttons[0]).not.toHaveProperty('callback_data');
  });
});
