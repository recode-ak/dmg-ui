import { describe, expect, test } from 'bun:test';
import { ok } from 'dmg-core';
import type {
  ClientMessage as ClientMsg,
  ServerMessage as ServerMsg,
} from '../wire/page-messages.types';
import { MAX_SERVER_TEXT } from '../wire/page-wire.const';
import type { PageSocket, PageSocketEvents } from './page-socket.types';
import { PageSocketEnd } from './page-socket-end';

// Клиентский конец провода поверх сокета: первое сообщение — `hello`, иначе
// отказ соединения; после `hello` — сообщения по схеме обработчику, плохой
// кадр и закрытие — обрыв ровно один раз. Сокет — подделка узкого порта;
// события подаются синхронно, как их подаёт сокет браузера.

const CONTEXT = {
  locale: 'kk-KZ',
  timeZone: 'Asia/Almaty',
  delegate: false,
  readOnly: false,
} as const;
const HELLO: ServerMsg = { kind: 'hello', context: CONTEXT };
const WATCH_REFUSED: ServerMsg = { kind: 'watch-refused', watch: 'w1' };
const RESULT: ServerMsg = { kind: 'result', id: 'c1', result: ok([]) };
const NOTIFICATION: ServerMsg = {
  kind: 'notification',
  notification: 'exampleUi/todo/taskAssigned',
  data: { title: 'Сыр' },
  links: [],
  eventId: 'e-1',
};
const UNWATCH: ClientMsg = { kind: 'unwatch', watch: 'w1' };

/** Сокет: отправленные строки, число закрытий, события — от теста. */
class StubSocket implements PageSocket {
  readonly sent: string[] = [];
  closes = 0;
  private events: PageSocketEvents | undefined;

  send(text: string): void {
    this.sent.push(text);
  }

  close(): void {
    this.closes += 1;
  }

  listen(events: PageSocketEvents): void {
    this.events = events;
  }

  message(data: unknown): void {
    this.subscribed().message(data);
  }

  closed(code: number): void {
    this.subscribed().closed(code);
  }

  private subscribed(): PageSocketEvents {
    if (this.events === undefined) {
      throw new Error('StubSocket: конец не подписался на события сокета');
    }
    return this.events;
  }
}

/** Соединение до ответа сервера: `connect` начат, сокет ждёт событий. */
const connecting = () => {
  const socket = new StubSocket();
  return { socket, result: PageSocketEnd.connect(socket) };
};

/** Открытый конец: `hello` принят, обработчики сообщений и обрыва — журналы. */
const opened = async () => {
  const { socket, result } = connecting();
  socket.message(JSON.stringify(HELLO));
  const res = await result;
  if (!res.ok) throw new Error('connect: ожидался конец провода');
  const end = res.value;
  const received: ServerMsg[] = [];
  const breaks: Error[] = [];
  end.onMessage((message) => {
    received.push(message);
  });
  end.onBreak((error) => {
    breaks.push(error);
  });
  return { socket, end, received, breaks };
};

describe('PageSocketEnd.connect', () => {
  test('первое сообщение hello — ok, контекст из него, сокет открыт', async () => {
    const { socket, result } = connecting();

    socket.message(JSON.stringify(HELLO));
    const res = await result;

    expect(res.ok && res.value.context).toEqual(CONTEXT);
    expect(socket.closes).toBe(0);
  });

  test('сокет закрыт до hello — refused', async () => {
    const { socket, result } = connecting();

    socket.closed(4403);

    expect(await result).toEqual({ ok: false, error: 'refused' });
  });

  test.each([
    ['первым не hello', JSON.stringify(RESULT)],
    ['не JSON', '{не json'],
    ['hello не по схеме', JSON.stringify({ kind: 'hello', context: {} })],
    ['нестрока', new Uint8Array([1])],
  ] satisfies [string, unknown][])(
    '%s — refused, сокет закрыт',
    async (_name, data) => {
      const { socket, result } = connecting();

      socket.message(data);

      expect(await result).toEqual({ ok: false, error: 'refused' });
      expect(socket.closes).toBe(1);
    },
  );
});

describe('PageSocketEnd — после hello', () => {
  test('сообщения по схеме — обработчику по порядку, объекты разобраны из строк', async () => {
    const { socket, received } = await opened();

    for (const message of [WATCH_REFUSED, RESULT, NOTIFICATION]) {
      socket.message(JSON.stringify(message));
    }

    expect(received).toStrictEqual([WATCH_REFUSED, RESULT, NOTIFICATION]);
  });

  test('промис обработчика конец не ждёт: следующее сообщение доставлено, пока первый висит', async () => {
    const { socket, end } = await opened();
    const seen: ServerMsg['kind'][] = [];
    end.onMessage((message) => {
      seen.push(message.kind);
      return new Promise<void>(() => {});
    });

    socket.message(JSON.stringify(WATCH_REFUSED));
    socket.message(JSON.stringify(RESULT));

    expect(seen).toEqual(['watch-refused', 'result']);
  });

  test('строка длиннее MAX_SERVER_TEXT — не доставлена, сокет закрыт, обрыв один раз', async () => {
    const { socket, received, breaks } = await opened();

    socket.message(JSON.stringify(NOTIFICATION).padEnd(MAX_SERVER_TEXT + 1));
    socket.closed(1000);

    expect(received).toEqual([]);
    expect(socket.closes).toBe(1);
    expect(breaks).toHaveLength(1);
  });

  test('строка ровно на пределе — доставлена', async () => {
    const { socket, received, breaks } = await opened();

    socket.message(JSON.stringify(NOTIFICATION).padEnd(MAX_SERVER_TEXT));

    expect(received).toStrictEqual([NOTIFICATION]);
    expect(breaks).toEqual([]);
    expect(socket.closes).toBe(0);
  });

  test.each([
    ['нестрока', new Uint8Array([1])],
    ['не JSON', '{не json'],
    ['не по схеме', JSON.stringify({ ...RESULT, extra: 1 })],
  ] satisfies [string, unknown][])(
    '%s — не доставлено, сокет закрыт, обрыв один раз; дальше ничего не доставляется',
    async (_name, data) => {
      const { socket, received, breaks } = await opened();

      socket.message(data);
      socket.message(JSON.stringify(RESULT));
      socket.closed(1000);

      expect(received).toEqual([]);
      expect(socket.closes).toBe(1);
      expect(breaks).toHaveLength(1);
    },
  );

  test('сокет закрыт (1006) — обрыв один раз, повторное событие второго не даёт', async () => {
    const { socket, breaks } = await opened();

    socket.closed(1006);
    socket.closed(1006);

    expect(breaks).toHaveLength(1);
  });

  test('end.close — сокет закрыт один раз, обрыв один раз; позднее closed второго не даёт', async () => {
    const { socket, end, breaks } = await opened();

    end.close();
    end.close();
    socket.closed(1000);

    expect(socket.closes).toBe(1);
    expect(breaks).toHaveLength(1);
  });

  test('send — ровно JSON.stringify сообщения', async () => {
    const { socket, end } = await opened();

    end.send(UNWATCH);

    expect(socket.sent).toEqual([JSON.stringify(UNWATCH)]);
  });

  test.each([
    ['end.close', (_socket: StubSocket, end: { close(): void }) => end.close()],
    ['closed(1006)', (socket: StubSocket) => socket.closed(1006)],
  ] satisfies [string, (socket: StubSocket, end: { close(): void }) => void][])(
    'send после закрытия (%s) — в сокет не уходит',
    async (_name, close) => {
      const { socket, end } = await opened();

      close(socket, end);
      end.send(UNWATCH);

      expect(socket.sent).toEqual([]);
    },
  );
});
