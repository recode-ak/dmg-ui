import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { inspect } from 'node:util';
import { MemoryLogger } from 'dmg-core/testing';
import { TELEGRAM_ALLOWED_UPDATES } from 'dmg-ui/tg-bot';
import { TestUpdates } from 'dmg-ui/tg-bot/testing';
import { Bot } from 'grammy';
import { FakeBotApiServer } from './fake-bot-api-server';
import type { FakeBotApiResponder } from './fake-bot-api-server.types';
import { GrammyPolling } from './grammy-polling';

// Опрос `getUpdates` на grammy проверяется на loopback: поддельный Bot API
// отдаёт заготовленные пачки апдейтов, дальше держит долгий запрос до отмены.
// Ожидание — по вызовам сервера и по приёмнику, без таймеров.

const TOKEN = 'test-token';
const BOT_ID = 7350009000;
const CHAT = 7350001234;
const SECRET_TEXT = 'секретный текст человека';

/** Приёмник апдейтов (роль `ExampleBot.receive`): помнит принятое и будит ожидающих. */
class Receiver {
  readonly received: unknown[] = [];
  private waiters: { count: number; resolve: () => void }[] = [];

  constructor(
    private readonly onUpdate: (update: unknown) => void = () => {},
  ) {}

  receive = async (update: unknown): Promise<void> => {
    this.received.push(update);
    for (const waiter of this.waiters) {
      if (this.received.length >= waiter.count) waiter.resolve();
    }
    this.onUpdate(update);
  };

  /** Разрешается, когда принято не меньше `count` апдейтов. */
  reached(count: number): Promise<void> {
    if (this.received.length >= count) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this.waiters.push({ count, resolve });
    });
  }
}

let server: FakeBotApiServer;
let polling: GrammyPolling | undefined;
let running: Promise<void> | undefined;

afterEach(async () => {
  await polling?.stop();
  await running;
  polling = undefined;
  running = undefined;
  await server.stop();
});

/** Сервер: `getMe`, пачки `getUpdates` по очереди, затем долгий опрос до отмены. */
const connect = (
  batches: readonly unknown[][],
  getUpdatesReply?: FakeBotApiResponder,
) => {
  const queue = [...batches];
  server = FakeBotApiServer.start({
    getMe: () =>
      FakeBotApiServer.result({
        id: BOT_ID,
        is_bot: true,
        first_name: 'Пример',
        username: 'example_bot',
      }),
    deleteWebhook: () => FakeBotApiServer.result(true),
    getUpdates: (call, signal) => {
      if (getUpdatesReply) return getUpdatesReply(call, signal);
      // Подтверждающий вызов `Bot.stop` идёт без `timeout`: отвечаем сразу.
      const batch = call.body.timeout === undefined ? undefined : queue.shift();
      if (batch !== undefined) return FakeBotApiServer.result(batch);
      return call.body.timeout === undefined
        ? FakeBotApiServer.result([])
        : FakeBotApiServer.untilAborted(signal);
    },
  });
  const logger = new MemoryLogger();
  const bot = new Bot(TOKEN, { client: { apiRoot: server.apiRoot } });
  polling = new GrammyPolling({ bot, logger });
  return { polling, logger };
};

describe('GrammyPolling — getMe, getUpdates, подача в приёмник', () => {
  test('identify: id и username бота из getMe', async () => {
    const { polling: p } = connect([]);

    const me = await p.identify();

    expect(me).toEqual({ id: BOT_ID, username: 'example_bot' });
    expect(server.of('getMe')).toHaveLength(1);
  });

  test('при старте вызван deleteWebhook до первого getUpdates', async () => {
    const updates = new TestUpdates();
    const { polling: p } = connect([[updates.text(CHAT, '/start')]]);
    const receiver = new Receiver();

    running = p.start(receiver);
    await receiver.reached(1);

    const order = server.calls.map((call) => call.method);
    expect(order.indexOf('deleteWebhook')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('deleteWebhook')).toBeLessThan(
      order.indexOf('getUpdates'),
    );
  });

  test('getUpdates просит виды апдейтов TELEGRAM_ALLOWED_UPDATES', async () => {
    const updates = new TestUpdates();
    const { polling: p } = connect([[updates.text(CHAT, '/start')]]);
    const receiver = new Receiver();

    running = p.start(receiver);
    await receiver.reached(1);

    expect(server.of('getUpdates')[0]?.body.allowed_updates).toEqual([
      ...TELEGRAM_ALLOWED_UPDATES,
    ]);
  });

  test('апдейт отдан в приёмник как есть', async () => {
    const updates = new TestUpdates();
    const update = updates.text(CHAT, '/start');
    const { polling: p } = connect([[update]]);
    const receiver = new Receiver();

    running = p.start(receiver);
    await receiver.reached(1);
    await server.reached((calls) => calls.filter(isPoll).length >= 2);

    expect(receiver.received).toEqual([update]);
  });

  test('остановка: запуск завершается, висящего запроса к серверу не остаётся', async () => {
    const updates = new TestUpdates();
    const { polling: p } = connect([[updates.text(CHAT, '/start')]]);
    const receiver = new Receiver();
    const started = p.start(receiver);
    running = started;
    await receiver.reached(1);
    await server.reached((calls) => calls.filter(isPoll).length >= 2);

    await p.stop();
    await started;
    await server.idle();

    expect(server.of('getUpdates').length).toBeGreaterThanOrEqual(2);
  });
});

/** Всё, что видно в записях: `inspect` показывает и `Error` (`JSON.stringify` дал бы `{}`). */
const dumpOf = (value: unknown): string => inspect(value, { depth: 10 });

/** Вызов долгого опроса: у подтверждающего вызова `Bot.stop` `timeout` нет. */
const isPoll = (call: { method: string; body: Record<string, unknown> }) =>
  call.method === 'getUpdates' && call.body.timeout !== undefined;

describe('GrammyPolling — ошибка обработки апдейта', () => {
  test('приёмник бросил: опрос не остановлен, следующий апдейт принят', async () => {
    const updates = new TestUpdates();
    const first = updates.text(CHAT, SECRET_TEXT);
    const second = updates.text(CHAT, '/start');
    const { polling: p } = connect([[first, second]]);
    const received: unknown[] = [];
    const both = new Promise<void>((resolve) => {
      running = p.start({
        receive: async (update) => {
          received.push(update);
          if (received.length === 2) resolve();
          if (update === received[0]) {
            throw new Error(`сбой с данными: ${SECRET_TEXT} ${TOKEN}`);
          }
        },
      });
    });
    const silence = [
      spyOn(console, 'log'),
      spyOn(console, 'error'),
      spyOn(console, 'warn'),
    ];

    try {
      await both;

      expect(received).toEqual([first, second]);
      for (const spy of silence) {
        expect(dumpOf(spy.mock.calls)).not.toContain(SECRET_TEXT);
        expect(dumpOf(spy.mock.calls)).not.toContain(TOKEN);
      }
    } finally {
      for (const spy of silence) spy.mockRestore();
    }
  });

  test('ошибка обработки: запись error в лог без токена, текста человека, контекста и payload', async () => {
    const updates = new TestUpdates();
    const { polling: p, logger } = connect([[updates.text(CHAT, SECRET_TEXT)]]);
    const receiver = new Receiver(() => {
      throw new Error(`сбой с данными: ${SECRET_TEXT} ${TOKEN}`);
    });

    running = p.start(receiver);
    // Следующий долгий опрос идёт после обработки апдейта и записи об ошибке.
    await server.reached((calls) => calls.filter(isPoll).length >= 2);

    expect(logger.records.some((record) => record.level === 'error')).toBe(
      true,
    );
    const dump = JSON.stringify(logger.records);
    expect(dump).not.toContain(TOKEN);
    expect(dump).not.toContain(SECRET_TEXT);
    expect(dump).not.toContain('update_id');
    expect(dump).not.toContain('chat_id');
  });
});

describe('GrammyPolling — отказы сервера и сети', () => {
  const refusal = (code: number, description: string) => () => ({
    status: code,
    body: { ok: false, error_code: code, description },
  });

  test('409 на getUpdates: start отклоняется, isConflict — true', async () => {
    const { polling: p } = connect(
      [],
      refusal(409, 'Conflict: other getUpdates'),
    );

    const error = await p.start(new Receiver()).then(
      () => undefined,
      (failure: unknown) => failure,
    );

    expect(error).toBeDefined();
    expect(GrammyPolling.isConflict(error)).toBe(true);
  });

  test('401 на getUpdates: start отклоняется, isConflict — false', async () => {
    const { polling: p } = connect([], refusal(401, 'Unauthorized'));

    const error = await p.start(new Receiver()).then(
      () => undefined,
      (failure: unknown) => failure,
    );

    expect(error).toBeDefined();
    expect(GrammyPolling.isConflict(error)).toBe(false);
  });

  test('isConflict: обычная ошибка и не-ошибка — false', () => {
    expect(GrammyPolling.isConflict(new Error('409'))).toBe(false);
    expect(GrammyPolling.isConflict(undefined)).toBe(false);
  });

  test('getMe отклонён (401): identify бросает, токена в консоли и логе нет', async () => {
    server = FakeBotApiServer.start({ getMe: refusal(401, 'Unauthorized') });
    const logger = new MemoryLogger();
    const bot = new Bot(TOKEN, { client: { apiRoot: server.apiRoot } });
    polling = new GrammyPolling({ bot, logger });
    const silence = [
      spyOn(console, 'log'),
      spyOn(console, 'error'),
      spyOn(console, 'warn'),
    ];

    try {
      const error = await polling.identify().then(
        () => undefined,
        (failure: unknown) => failure,
      );

      expect(error).toBeDefined();
      expect(GrammyPolling.isConflict(error)).toBe(false);
      for (const spy of silence) {
        expect(dumpOf(spy.mock.calls)).not.toContain(TOKEN);
      }
      expect(dumpOf(logger.records)).not.toContain(TOKEN);
    } finally {
      for (const spy of silence) spy.mockRestore();
    }
  });

  test('сервер закрыт во время опроса: токена нет ни в консоли, ни в логе', async () => {
    const { polling: p, logger } = connect([]);
    const silence = [
      spyOn(console, 'log'),
      spyOn(console, 'error'),
      spyOn(console, 'warn'),
    ];

    try {
      running = p.start(new Receiver()).catch(() => undefined);
      await server.reached((calls) => calls.filter(isPoll).length >= 1);
      await server.stop();
      await p.stop();
      await running;

      for (const spy of silence) {
        expect(dumpOf(spy.mock.calls)).not.toContain(TOKEN);
      }
      expect(dumpOf(logger.records)).not.toContain(TOKEN);
    } finally {
      for (const spy of silence) spy.mockRestore();
    }
  });
});
