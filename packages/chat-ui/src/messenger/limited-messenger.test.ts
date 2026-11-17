import { describe, expect, test } from 'bun:test';
import { err, ok } from 'dmg-core';
import { MemoryLogger } from 'dmg-core/testing';
import { MemoryMessenger } from '../../testing';
import { TextLength } from '../limit/text-length';
import type { Message, MessageOption } from '../message/message.types';
import { TextBuilder } from '../message/text-builder';
import { LimitedMessenger } from './limited-messenger';
import { LIMIT_TEXTS } from './messenger.const';
import type {
  Delivery,
  MessageHandle,
  MessengerCapabilities,
  MessengerPort,
  SendOptions,
  Updated,
} from './messenger.types';

// Страж лимитов перед портом: подгоняет сообщение под возможности порта,
// пишет по записи на каждый разрез (обрезка — `warn`, лишние варианты —
// `error`) без данных собеседника и отдаёт итог порта как есть.

const T0 = 1_700_000_000_000;
const PEER = 'peer-a';

type Call = { readonly op: string; readonly args: readonly unknown[] };

/** Порт, который только запоминает вызовы и отвечает успехом. */
class SpyPort implements MessengerPort {
  readonly calls: Call[] = [];

  constructor(readonly capabilities: MessengerCapabilities) {}

  show(
    peer: string,
    message: Message,
    send?: SendOptions,
  ): Promise<Delivery<MessageHandle>> {
    this.calls.push({ op: 'show', args: [peer, message, send] });
    return Promise.resolve(ok('h1'));
  }

  update(
    peer: string,
    handle: MessageHandle,
    message: Message,
    send?: SendOptions,
  ): Promise<Delivery<Updated>> {
    this.calls.push({ op: 'update', args: [peer, handle, message, send] });
    return Promise.resolve(ok({ handle, edited: true }));
  }

  retire(
    peer: string,
    handle: MessageHandle,
    message: Message,
    chosen?: string,
  ): Promise<Delivery<void>> {
    this.calls.push({ op: 'retire', args: [peer, handle, message, chosen] });
    return Promise.resolve(ok());
  }

  answer(peer: string, press: string, text?: string): Promise<Delivery<void>> {
    this.calls.push({ op: 'answer', args: [peer, press, text] });
    return Promise.resolve(ok());
  }

  notify(peer: string, message: Message): Promise<Delivery<MessageHandle>> {
    this.calls.push({ op: 'notify', args: [peer, message] });
    return Promise.resolve(ok('h2'));
  }
}

const option = (n: number, label = `Вариант ${n}`): MessageOption => ({
  ref: `r${n}`,
  label,
});

const message = (
  text: string,
  options: readonly MessageOption[] = [],
): Message => ({ kind: 'text', text: TextBuilder.of(text), options });

const guarded = (port: MessengerPort) => {
  const logger = new MemoryLogger();
  return { guard: new LimitedMessenger({ port, logger }), logger };
};

const lastSent = (port: MemoryMessenger): Message => {
  const entry = port.journal.at(-1);
  if (entry === undefined || !('message' in entry))
    throw new Error('в журнале нет сообщения');
  return entry.message;
};

describe('LimitedMessenger', () => {
  test('без стража мессенджер отвергает, со стражем сообщение доходит обрезанным', async () => {
    const tooBig = message(
      'a'.repeat(1100),
      [1, 2, 3, 4].map((n) => option(n)),
    );
    const bare = MemoryMessenger.windowed(() => T0);
    const port = MemoryMessenger.windowed(() => T0);
    const { guard } = guarded(port);

    expect(await bare.show(PEER, tooBig)).toEqual(err({ reason: 'rejected' }));
    expect(bare.journal).toEqual([
      { op: 'undelivered', via: 'show', peer: PEER, reason: 'rejected' },
    ]);

    const delivered = await guard.show(PEER, tooBig);

    expect(delivered.ok).toBe(true);
    const sent = lastSent(port);
    expect(new TextLength('codePoint').of(sent.text)).toBe(1024);
    expect(sent.options).toEqual([option(1), option(2), option(3)]);
  });

  test('возможности стража — те же, что у порта', () => {
    const port = MemoryMessenger.windowed(() => T0);

    expect(guarded(port).guard.capabilities).toBe(port.capabilities);
  });

  test('на каждый разрез — одна запись warn с точным meta', async () => {
    const port = MemoryMessenger.windowed(() => T0);
    const { guard, logger } = guarded(port);

    await guard.show(
      PEER,
      message('a'.repeat(1100), [option(1), option(2, 'д'.repeat(25))]),
    );

    expect(logger.records).toStrictEqual([
      {
        level: 'warn',
        source: 'chat-ui',
        message: LIMIT_TEXTS.trimmed,
        meta: {
          messenger: port.capabilities.name,
          operation: 'show',
          limit: 'label',
          unit: 'grapheme',
          max: 20,
          length: 25,
          index: 1,
        },
      },
      {
        level: 'warn',
        source: 'chat-ui',
        message: LIMIT_TEXTS.trimmed,
        meta: {
          messenger: port.capabilities.name,
          operation: 'show',
          limit: 'textWithOptions',
          unit: 'codePoint',
          max: 1024,
          length: 1100,
        },
      },
    ]);
  });

  test('лишние варианты — error с числом вариантов и пределом', async () => {
    const port = MemoryMessenger.windowed(() => T0);
    const { guard, logger } = guarded(port);

    await guard.show(
      PEER,
      message(
        'Выбери',
        [1, 2, 3, 4, 5].map((n) => option(n)),
      ),
    );

    expect(logger.records).toStrictEqual([
      {
        level: 'error',
        source: 'chat-ui',
        message: LIMIT_TEXTS.dropped,
        meta: {
          messenger: port.capabilities.name,
          operation: 'show',
          limit: 'options',
          max: 3,
          length: 5,
        },
      },
    ]);
    expect(lastSent(port).options).toEqual([option(1), option(2), option(3)]);
  });

  test.each([
    ['show', (g: MessengerPort, m: Message) => g.show(PEER, m)],
    ['update', (g: MessengerPort, m: Message) => g.update(PEER, 'h0', m)],
    ['retire', (g: MessengerPort, m: Message) => g.retire(PEER, 'h0', m)],
    ['notify', (g: MessengerPort, m: Message) => g.notify(PEER, m)],
  ] as const)(
    'операция %s подгоняется и пишется в лог со своим именем',
    async (operation, call) => {
      const port = new SpyPort(MemoryMessenger.editing().capabilities);
      const { guard, logger } = guarded(port);

      await call(guard, message('Выбери', [option(1, 'д'.repeat(70))]));

      expect(logger.records.map((r) => r.meta?.operation)).toEqual([operation]);
      expect(port.calls.map((c) => c.op)).toEqual([operation]);
      const sent = port.calls[0]?.args.find(
        (arg): arg is Message =>
          typeof arg === 'object' && arg !== null && 'kind' in arg,
      );
      expect(sent?.options).toEqual([option(1, `${'д'.repeat(63)}…`)]);
    },
  );

  test('в лог не идут данные собеседника', async () => {
    const mark = {
      text: 'zqtext',
      label: 'zqlabel',
      url: 'https://example.org/zqurl',
      ref: 'zqref',
      peer: 'zqpeer',
      handle: 'zqhandle',
      press: 'zqpress',
      answer: 'zqanswer',
      chosen: 'zqchosen',
    };
    const sensitive: Message = {
      kind: 'text',
      text: new TextBuilder()
        .text(`${mark.text} ${'a'.repeat(5000)}`)
        .link('ссылка', mark.url)
        .build(),
      options: [
        { ref: mark.ref, label: `${mark.label} ${'д'.repeat(70)}` },
        ...[2, 3, 4, 5].map((n) => option(n)),
      ],
    };
    const windowed = guarded(MemoryMessenger.windowed(() => T0));
    const editing = guarded(MemoryMessenger.editing());

    for (const { guard } of [windowed, editing]) {
      await guard.show(mark.peer, sensitive);
      await guard.update(mark.peer, mark.handle, sensitive);
      await guard.retire(mark.peer, mark.handle, sensitive, mark.chosen);
      await guard.notify(mark.peer, sensitive);
      await guard.answer(
        mark.peer,
        mark.press,
        `${mark.answer} ${'a'.repeat(300)}`,
      );
    }

    const logged = JSON.stringify([
      ...windowed.logger.records,
      ...editing.logger.records,
    ]);
    expect(windowed.logger.records.length).toBeGreaterThan(0);
    expect(editing.logger.records.length).toBeGreaterThan(0);
    for (const value of Object.values(mark))
      expect(logged).not.toContain(value);
    expect(logged).not.toContain('zq');
  });

  test('уложилось — записей нет, порт получает то же сообщение', async () => {
    const port = new SpyPort(MemoryMessenger.editing().capabilities);
    const { guard, logger } = guarded(port);
    const fitting = message('Купить хлеб', [option(1), option(2)]);

    await guard.show(PEER, fitting);
    await guard.answer(PEER, 'press-1', 'Принято');

    expect(logger.records).toEqual([]);
    expect(port.calls[0]?.args[1]).toBe(fitting);
    expect(port.calls[1]?.args).toEqual([PEER, 'press-1', 'Принято']);
  });

  test('параметры вызова уходят в порт как есть', async () => {
    const port = new SpyPort(MemoryMessenger.editing().capabilities);
    const { guard } = guarded(port);
    const fitting = message('Купить хлеб');

    await guard.show(PEER, fitting, { initiative: true });
    await guard.update(PEER, 'h7', fitting, { initiative: true });
    await guard.retire(PEER, 'h7', fitting, 'r2');
    await guard.answer(PEER, 'press-1');
    await guard.notify(PEER, fitting);

    expect(port.calls).toEqual([
      { op: 'show', args: [PEER, fitting, { initiative: true }] },
      { op: 'update', args: [PEER, 'h7', fitting, { initiative: true }] },
      { op: 'retire', args: [PEER, 'h7', fitting, 'r2'] },
      { op: 'answer', args: [PEER, 'press-1', undefined] },
      { op: 'notify', args: [PEER, fitting] },
    ]);
  });

  test('ссылка сверх лимита — бросок, в журнале порта пусто', async () => {
    const port = MemoryMessenger.editing();
    const { guard } = guarded(port);
    const tooLong = message('Выбери', [
      { ref: 'r'.repeat(port.capabilities.options.ref + 1), label: 'Да' },
    ]);

    await expect(
      Promise.resolve().then(() => guard.show(PEER, tooLong)),
    ).rejects.toThrow();
    expect(port.journal).toEqual([]);
  });

  test.each([
    ['show', (g: MessengerPort, m: Message) => g.show(PEER, m)],
    ['update', (g: MessengerPort, m: Message) => g.update(PEER, 'm1', m)],
    ['retire', (g: MessengerPort, m: Message) => g.retire(PEER, 'm1', m)],
    ['answer', (g: MessengerPort) => g.answer(PEER, 'press-1', 'Принято')],
    ['notify', (g: MessengerPort, m: Message) => g.notify(PEER, m)],
  ] as const)('недоставка порта в %s отдаётся как есть', async (_, call) => {
    const port = MemoryMessenger.editing();
    const { guard, logger } = guarded(port);
    port.failNext('blocked');

    expect(await call(guard, message('Купить хлеб'))).toEqual(
      err({ reason: 'blocked' }),
    );
    expect(logger.records).toEqual([]);
  });

  test('успех порта отдаётся как есть', async () => {
    const port = new SpyPort(MemoryMessenger.editing().capabilities);
    const { guard } = guarded(port);

    expect(await guard.show(PEER, message('Купить хлеб'))).toEqual(ok('h1'));
    expect(await guard.update(PEER, 'h5', message('Купить хлеб'))).toEqual(
      ok({ handle: 'h5', edited: true }),
    );
  });

  test('возможности не по схеме — бросок в конструкторе', () => {
    const good = MemoryMessenger.editing().capabilities;
    const broken = new SpyPort({ ...good, text: { max: 0, unit: 'utf16' } });

    expect(
      () => new LimitedMessenger({ port: broken, logger: new MemoryLogger() }),
    ).toThrow();
  });

  test('answer: текст обрезан по pressAnswer', async () => {
    const port = MemoryMessenger.editing();
    const { guard, logger } = guarded(port);

    await guard.answer(PEER, 'press-1', 'a'.repeat(250));

    expect(port.journal).toEqual([
      {
        op: 'answered',
        peer: PEER,
        press: 'press-1',
        text: `${'a'.repeat(199)}…`,
      },
    ]);
    expect(logger.records).toStrictEqual([
      {
        level: 'warn',
        source: 'chat-ui',
        message: LIMIT_TEXTS.trimmed,
        meta: {
          messenger: port.capabilities.name,
          operation: 'answer',
          limit: 'pressAnswer',
          unit: 'utf16',
          max: 200,
          length: 250,
        },
      },
    ]);
  });

  test('answer: без pressAnswer текст уходит как есть и записей нет', async () => {
    const port = new SpyPort(MemoryMessenger.windowed(() => T0).capabilities);
    const { guard, logger } = guarded(port);
    const long = 'a'.repeat(500);

    expect(await guard.answer(PEER, 'press-1', long)).toEqual(ok());

    expect(port.calls).toEqual([
      { op: 'answer', args: [PEER, 'press-1', long] },
    ]);
    expect(logger.records).toEqual([]);
  });
});
