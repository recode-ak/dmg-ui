import { describe, expect, test } from 'bun:test';
import { err, ok, type Result } from 'dmg-core';
import { MemoryLogger } from 'dmg-core/testing';
import type { PageServerPort, ServerLink } from '../wire/page-wire.types';
import type { PageAdmission, PageServerSocket } from './page-server.types';
import { PageSockets } from './page-sockets';

// Мост событий сокета к порту серверной половины: открытие — `connect` по
// токену из ворот, кадр — `receive` без ожидания предыдущего, закрытие —
// освобождение связи, в том числе пока `connect` ещё идёт. Кадр до связи —
// нарушение протокола, двоичный кадр — мусор. Сокет и хост — подделки.

const HELLO = JSON.stringify({
  kind: 'hello',
  context: {
    locale: 'ru-RU',
    timeZone: 'UTC',
    delegate: false,
    readOnly: false,
  },
});
const LATER = JSON.stringify({ kind: 'watch-refused', watch: 'w1' });

/** Сокет сервера: отправленные строки и код закрытия. */
class FakeSocket implements PageServerSocket {
  readonly sent: string[] = [];
  closed?: number;
  closes = 0;

  constructor(readonly data: PageAdmission) {}

  send(text: string): void {
    this.sent.push(text);
  }

  close(code?: number): void {
    this.closes += 1;
    this.closed = code;
  }
}

/**
 * Хост с управляемым `connect`: ответ — `accept`/`refuse`/`fail` по порядку
 * соединений. Каждый `receive` висит, пока тест его не завершит.
 */
class StubHost implements PageServerPort {
  readonly tokens: string[] = [];
  readonly received: string[] = [];
  readonly receiving: PromiseWithResolvers<void>[] = [];
  closes = 0;
  push: (text: string) => void = () => {};
  private readonly replies: PromiseWithResolvers<
    Result<ServerLink, 'refused'>
  >[] = [];
  private readonly link: ServerLink = {
    receive: (raw) => {
      this.received.push(raw);
      const done = Promise.withResolvers<void>();
      this.receiving.push(done);
      return done.promise;
    },
    close: () => {
      this.closes += 1;
    },
  };

  connect(
    token: string,
    push: (text: string) => void,
  ): Promise<Result<ServerLink, 'refused'>> {
    this.tokens.push(token);
    this.push = push;
    const reply = Promise.withResolvers<Result<ServerLink, 'refused'>>();
    this.replies.push(reply);
    return reply.promise;
  }

  accept(): void {
    this.replies.shift()?.resolve(ok(this.link));
  }

  refuse(): void {
    this.replies.shift()?.resolve(err('refused'));
  }

  fail(error: Error): void {
    this.replies.shift()?.reject(error);
  }
}

/** Логгер, который сообщает о первой записи `error`. */
class ErrorLogger extends MemoryLogger {
  private readonly first = Promise.withResolvers<void>();
  readonly errored = this.first.promise;

  override error(...args: Parameters<MemoryLogger['error']>): void {
    super.error(...args);
    this.first.resolve();
  }
}

const bridge = () => {
  const host = new StubHost();
  const logger = new ErrorLogger();
  const sockets = new PageSockets({ host, logger });
  return { host, logger, sockets };
};

type Bridge = ReturnType<typeof bridge>;

/** Сокет со связью: `connect` хоста завершён `ok`. */
const connected = async (b: Bridge, token = 't1') => {
  const socket = new FakeSocket({ token });
  const opening = b.sockets.open(socket);
  b.host.accept();
  await opening;
  return socket;
};

const levels = (logger: MemoryLogger, level: 'warn' | 'error') =>
  logger.records.filter((r) => r.level === level);

describe('PageSockets.open', () => {
  test('connect получил токен из data; пуш хоста — и hello во время connect — уходит в сокет строкой', async () => {
    const b = bridge();
    const socket = new FakeSocket({ token: 't1' });

    const opening = b.sockets.open(socket);
    b.host.push(HELLO);
    b.host.accept();
    await opening;
    b.host.push(LATER);

    expect(b.host.tokens).toEqual(['t1']);
    expect(socket.sent).toEqual([HELLO, LATER]);
    expect(socket.closed).toBeUndefined();
  });

  test('хост отказал — сокет закрыт кодом отказа 4403, ничего не отправлено', async () => {
    const b = bridge();
    const socket = new FakeSocket({ token: 't1' });

    const opening = b.sockets.open(socket);
    b.host.refuse();
    await opening;

    expect(socket.closed).toBe(4403);
    expect(socket.sent).toEqual([]);
  });

  test('connect хоста отклонён — open не отклоняется, сокет закрыт, error без текста броска', async () => {
    const b = bridge();
    const socket = new FakeSocket({ token: 't1' });

    const opening = b.sockets.open(socket);
    b.host.fail(new Error('страж-броска-хоста'));

    expect(
      await opening.then(
        () => 'разрешён',
        () => 'отклонён',
      ),
    ).toBe('разрешён');
    expect(socket.closes).toBe(1);
    expect(levels(b.logger, 'error')).toHaveLength(1);
    expect(JSON.stringify(b.logger.records)).not.toContain('страж');
  });
});

describe('PageSockets.message', () => {
  test('кадры после связи — в receive в порядке прихода, второй начат, пока первый висит', async () => {
    const b = bridge();
    const socket = await connected(b);

    b.sockets.message(socket, 'первый');
    b.sockets.message(socket, 'второй');

    expect(b.host.received).toEqual(['первый', 'второй']);
    expect(b.host.receiving).toHaveLength(2);
  });

  test('кадр, пока connect не завершён, — закрытие кодом протокола 4400, один warn, receive не вызван, связь закрыта по завершении connect', async () => {
    const b = bridge();
    const socket = new FakeSocket({ token: 't1' });
    const opening = b.sockets.open(socket);

    b.sockets.message(socket, 'рано');
    b.sockets.message(socket, 'ещё раньше hello');
    expect(b.host.closes).toBe(0);
    b.host.accept();
    await opening;

    expect(socket.closed).toBe(4400);
    expect(levels(b.logger, 'warn')).toHaveLength(1);
    expect(b.host.received).toEqual([]);
    expect(b.host.closes).toBe(1);
  });

  test('двоичный кадр — refused malformed, receive не вызван, соединение живо', async () => {
    const b = bridge();
    const socket = await connected(b);

    b.sockets.message(socket, new Uint8Array([1]));
    b.sockets.message(socket, 'текст');

    expect(socket.sent).toEqual(['{"kind":"refused","reason":"malformed"}']);
    expect(b.host.received).toEqual(['текст']);
    expect(socket.closes).toBe(0);
  });

  test('отклонённый receive — error без текста броска, промис не висит', async () => {
    const b = bridge();
    const socket = await connected(b);

    b.sockets.message(socket, 'кадр');
    b.host.receiving[0]?.reject(new Error('страж-броска-приёма'));
    await b.logger.errored;

    expect(levels(b.logger, 'error')).toHaveLength(1);
    expect(JSON.stringify(b.logger.records)).not.toContain('страж');
  });
});

describe('PageSockets.close', () => {
  test('при живой связи — link.close один раз; повтор close и кадр после него — без действия', async () => {
    const b = bridge();
    const socket = await connected(b);

    await b.sockets.close(socket);
    await b.sockets.close(socket);
    b.sockets.message(socket, 'после закрытия');
    b.host.push(LATER);

    expect(b.host.closes).toBe(1);
    expect(b.host.received).toEqual([]);
    expect(socket.sent).toEqual([]);
    expect(socket.closes).toBe(0);
    expect(b.logger.records).toEqual([]);
  });

  test('пока connect висит, затем connect завершён ok — link.close вызван, пуш после закрытия в сокет не попал', async () => {
    const b = bridge();
    const socket = new FakeSocket({ token: 't1' });
    const opening = b.sockets.open(socket);

    const closing = b.sockets.close(socket);
    b.host.push(HELLO);
    b.host.accept();
    await closing;
    await opening;
    b.host.push(LATER);

    expect(b.host.closes).toBe(1);
    expect(socket.sent).toEqual([]);
  });

  test('пока connect висит, затем хост отказал — промис разрешён, закрывать нечего', async () => {
    const b = bridge();
    const socket = new FakeSocket({ token: 't1' });
    const opening = b.sockets.open(socket);

    const closing = b.sockets.close(socket);
    b.host.refuse();
    await closing;
    await opening;

    expect(b.host.closes).toBe(0);
    expect(socket.sent).toEqual([]);
  });

  test('сокет, которого мост не открывал, — без действия', async () => {
    const b = bridge();

    await b.sockets.close(new FakeSocket({ token: 't1' }));

    expect(b.host.closes).toBe(0);
  });
});

describe('PageSockets — лог', () => {
  test('в логе нет токена и содержимого кадров', async () => {
    const b = bridge();
    const guardToken = 'страж-пропуска';
    const guardFrame = 'страж-кадра';
    const early = new FakeSocket({ token: guardToken });
    const opening = b.sockets.open(early);
    b.sockets.message(early, guardFrame);
    b.host.refuse();
    await opening;
    const socket = await connected(b, guardToken);

    b.sockets.message(socket, new TextEncoder().encode(guardFrame));
    b.sockets.message(socket, guardFrame);
    b.host.receiving[0]?.reject(new Error(guardFrame));
    await b.logger.errored;

    expect(levels(b.logger, 'warn')).not.toEqual([]);
    const text = JSON.stringify(b.logger.records);
    expect(text).not.toContain(guardToken);
    expect(text).not.toContain(guardFrame);
  });
});
