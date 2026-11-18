import { describe, expect, test } from 'bun:test';
import { err, ok, type Result } from 'dmg-core';
import { TaskEvents } from 'dmg-core/testing/example';
import * as v from 'valibot';
import { ClientMessage, ServerMessage } from './page-messages';
import type {
  ClientMessage as ClientMsg,
  ServerMessage as ServerMsg,
} from './page-messages.types';
import { PageWire } from './page-wire';
import { MAX_SERVER_TEXT } from './page-wire.const';
import type { PageServerPort, ServerLink } from './page-wire.types';

// Провод страничного канала в памяти: между половинами ходят только строки
// JSON, порядок сохраняется, доставка асинхронная, `settled()` ждёт, пока не
// завершится вся работа, включая промисы обработчиков, — без таймеров и без
// счёта ходов (TST-04). Сервер — заглушка конца провода, пушит строки; схемы
// сообщений — граница, на которой сервер отвечает `refused` (мусор — в
// `page-host.test.ts`).

const CONTEXT = {
  locale: 'ru-RU',
  timeZone: 'Asia/Oral',
  delegate: false,
  readOnly: false,
} as const;

const HELLO: ServerMsg = { kind: 'hello', context: CONTEXT };
const ADDRESS = { screen: 'exampleUi/todo/taskList', params: { page: 0 } };

const signal = (n: number): ServerMsg => ({
  kind: 'signal',
  watch: 'w1',
  signal: {
    event: TaskEvents.created.name,
    eventId: `e-${n}`,
    trace: {
      cause: { kind: 'event', eventId: `e-${n}` },
      correlationId: `e-${n}`,
    },
  },
});

const NOTIFICATION = {
  kind: 'notification',
  notification: 'exampleUi/todo/taskAssigned',
  data: { title: 'Сыр' },
  links: [ADDRESS],
  eventId: 'e-1',
} as const;

const idOf = (length: number) => 'x'.repeat(length);

const watch: ClientMsg = { kind: 'watch', watch: 'w1', address: ADDRESS };
const call: ClientMsg = {
  kind: 'call',
  id: 'c1',
  call: { module: 'todo', uc: 'listTasks', input: {}, requestId: 'r-1' },
};
const unwatch: ClientMsg = { kind: 'unwatch', watch: 'w1' };

/**
 * Конец провода сервера: принятые строки, закрытия, ответ на `call`. `raw` —
 * строка сервера как есть, `push` — сообщение, сериализованное здесь.
 */
class StubServer implements PageServerPort {
  readonly received: string[] = [];
  readonly tokens: string[] = [];
  closed = 0;
  raw: (text: string) => void = () => {};

  push(message: ServerMsg): void {
    this.raw(JSON.stringify(message));
  }

  async connect(
    token: string,
    push: (text: string) => void,
  ): Promise<Result<ServerLink, 'refused'>> {
    this.tokens.push(token);
    if (token !== 'ok') return err('refused');
    this.raw = push;
    this.push(HELLO);
    return ok({
      receive: async (raw) => {
        this.received.push(raw);
        // Ответ приходит позже приёма: `settled()` обязан дождаться и его.
        await Promise.resolve();
        const message: unknown = JSON.parse(raw);
        if (
          typeof message === 'object' &&
          message !== null &&
          'kind' in message &&
          message.kind === 'call'
        ) {
          this.push({ kind: 'result', id: 'c1', result: ok({}) });
        }
      },
      close: () => {
        this.closed += 1;
      },
    });
  }
}

const connected = async (server: StubServer) => {
  const wire = new PageWire(server);
  const res = await wire.connect('ok');
  if (!res.ok) throw new Error('connect: ожидался конец провода');
  return { wire, end: res.value };
};

describe('PageWire.connect', () => {
  test('токен принят — клиентский конец с контекстом из hello; hello первым в журнале', async () => {
    const { wire, end } = await connected(new StubServer());

    expect(end.context).toEqual(CONTEXT);
    expect(wire.messages).toHaveLength(1);
    expect(JSON.parse(wire.messages[0] ?? '')).toEqual(HELLO);
  });

  test('сервер отказал — err refused, журнал пуст', async () => {
    const server = new StubServer();
    const wire = new PageWire(server);

    const res = await wire.connect('чужой');

    expect(res).toEqual({ ok: false, error: 'refused' });
    expect(server.tokens).toEqual(['чужой']);
    expect(wire.messages).toEqual([]);
  });
});

describe('PageWire — граница JSON', () => {
  test('в журнале только строки обеих сторон; каждая строка — JSON сообщения по схеме', async () => {
    const server = new StubServer();
    const { wire, end } = await connected(server);

    end.send(watch);
    end.send(call);
    server.push(signal(1));
    end.send(unwatch);
    await wire.settled();

    // hello, watch, call, signal, result (ответ заглушки на call), unwatch.
    expect(wire.messages).toHaveLength(6);
    for (const text of wire.messages) {
      expect(typeof text).toBe('string');
      const parsed: unknown = JSON.parse(text);
      const known =
        v.safeParse(ClientMessage, parsed).success ||
        v.safeParse(ServerMessage, parsed).success;
      expect(known).toBe(true);
    }
  });

  test('сервер получает строки клиента — JSON каждого сообщения — в порядке отправки', async () => {
    const server = new StubServer();
    const { wire, end } = await connected(server);

    end.send(watch);
    end.send(call);
    end.send(unwatch);
    await wire.settled();

    expect(server.received.every((raw) => typeof raw === 'string')).toBe(true);
    expect(server.received.map((raw) => JSON.parse(raw))).toEqual([
      watch,
      call,
      unwatch,
    ]);
  });

  test('клиент получает сообщения сервера по порядку: доставка асинхронная, объекты — копии', async () => {
    const server = new StubServer();
    const { wire, end } = await connected(server);
    const received: ServerMsg[] = [];
    end.onMessage((message) => {
      received.push(message);
    });
    const sent = [signal(1), signal(2), signal(3)];

    for (const message of sent) server.push(message);
    expect(received).toEqual([]);
    await wire.settled();

    expect(received).toStrictEqual(sent);
    expect(received[0]).not.toBe(sent[0]);
  });

  test('settled дожидается ответа сервера на отправленное, а не только очереди', async () => {
    const server = new StubServer();
    const { wire, end } = await connected(server);
    const received: ServerMsg[] = [];
    end.onMessage((message) => {
      received.push(message);
    });

    end.send(call);
    await wire.settled();

    expect(received).toEqual([{ kind: 'result', id: 'c1', result: ok({}) }]);
  });

  test('реакция клиента — промис обработчика: settled дожидается её и через 1000 ходов микрозадач', async () => {
    const server = new StubServer();
    const { wire, end } = await connected(server);
    end.onMessage(async () => {
      for (let turn = 0; turn < 1000; turn += 1) await Promise.resolve();
      end.send(unwatch);
    });

    server.push(signal(1));
    await wire.settled();

    expect(server.received.map((raw) => JSON.parse(raw))).toEqual([unwatch]);
  });

  test('обработчик сигнала шлёт call и ждёт result по тому же проводу — settled разрешается, тупика нет', async () => {
    const server = new StubServer();
    const { wire, end } = await connected(server);
    const reread: ServerMsg[] = [];
    let answered: ((message: ServerMsg) => void) | undefined;
    end.onMessage(async (message) => {
      if (message.kind === 'result') {
        answered?.(message);
        return;
      }
      if (message.kind !== 'signal') return;
      // Перечитывание по сигналу: ответ приходит, пока этот промис не разрешён.
      const reply = Promise.withResolvers<ServerMsg>();
      answered = reply.resolve;
      end.send(call);
      reread.push(await reply.promise);
    });

    server.push(signal(1));
    await wire.settled();

    expect(reread).toEqual([{ kind: 'result', id: 'c1', result: ok({}) }]);
  });

  test('обработчик без промиса — settled не крутит ходы: работу, о которой провод не знает, не ждёт', async () => {
    const server = new StubServer();
    const { wire, end } = await connected(server);
    end.onMessage(() => {
      // Реакция мимо промиса обработчика: провод о ней не узнаёт. 50 ходов —
      // с запасом больше собственных ходов `settled()` (около десяти).
      void (async () => {
        for (let turn = 0; turn < 50; turn += 1) await Promise.resolve();
        end.send(unwatch);
      })();
    });

    server.push(signal(1));
    await wire.settled();

    expect(server.received).toEqual([]);
  });
});

describe('PageWire — предел строки сервера', () => {
  const text = JSON.stringify(NOTIFICATION);

  test('строка длиннее MAX_SERVER_TEXT — не доставлена, обрыв один раз, settled бросает', async () => {
    const server = new StubServer();
    const { wire, end } = await connected(server);
    const received: ServerMsg[] = [];
    const breaks: string[] = [];
    end.onMessage((message) => {
      received.push(message);
    });
    end.onBreak((error) => breaks.push(error.message));

    server.raw(text.padEnd(MAX_SERVER_TEXT + 1, ' '));

    await expect(wire.settled()).rejects.toThrow('длиннее предела');
    expect(received).toEqual([]);
    expect(breaks).toEqual([expect.stringContaining('длиннее предела')]);
  });

  test('строка ровно на пределе — доставлена', async () => {
    const server = new StubServer();
    const { wire, end } = await connected(server);
    const received: ServerMsg[] = [];
    end.onMessage((message) => {
      received.push(message);
    });

    server.raw(text.padEnd(MAX_SERVER_TEXT, ' '));
    await wire.settled();

    expect(received).toStrictEqual([NOTIFICATION]);
  });
});

describe('PageWire — сообщение сервера не по схеме', () => {
  test('не доставляется; обрыв провода с ошибкой; settled бросает', async () => {
    const server = new StubServer();
    const { wire, end } = await connected(server);
    const received: ServerMsg[] = [];
    const breaks: string[] = [];
    end.onMessage((message) => {
      received.push(message);
    });
    end.onBreak((error) => breaks.push(error.message));

    server.push({ kind: 'result', id: idOf(257), result: ok({}) });

    await expect(wire.settled()).rejects.toThrow('не по схеме');
    expect(received).toEqual([]);
    expect(breaks).toEqual([expect.stringContaining('не по схеме')]);
  });

  test('после отброшенного сообщения следующее по схеме доставляется', async () => {
    const server = new StubServer();
    const { wire, end } = await connected(server);
    const received: ServerMsg[] = [];
    end.onMessage((message) => {
      received.push(message);
    });

    server.push({ kind: 'result', id: idOf(257), result: ok({}) });
    server.push(signal(1));
    await wire.settled().catch(() => {});

    expect(received).toStrictEqual([signal(1)]);
  });
});

describe('PageWire — закрытие', () => {
  test('close закрывает соединение сервера один раз; после него клиент серверу не пишет', async () => {
    const server = new StubServer();
    const { wire, end } = await connected(server);

    end.close();
    end.close();
    end.send(call);
    await wire.settled();

    expect(server.closed).toBe(1);
    expect(server.received).toEqual([]);
  });

  test('close — обрыв провода для клиента один раз', async () => {
    const { wire, end } = await connected(new StubServer());
    const breaks: string[] = [];
    end.onBreak((error) => breaks.push(error.message));

    end.close();
    end.close();
    await wire.settled();

    expect(breaks).toEqual([expect.stringContaining('закрыт')]);
  });
});

describe('PageMessages — схемы сообщений', () => {
  const clientValid: Record<string, unknown> = {
    call: call,
    watch: watch,
    unwatch: unwatch,
  };
  const serverValid: Record<string, unknown> = {
    hello: HELLO,
    result: { kind: 'result', id: 'c1', result: ok({ a: 1 }) },
    signal: signal(1),
    'watch-refused': { kind: 'watch-refused', watch: 'w1' },
    notification: NOTIFICATION,
    refused: { kind: 'refused', reason: 'malformed' },
  };

  test.each(Object.entries(clientValid))(
    'ClientMessage принимает %s',
    (_k, m) => {
      expect(v.safeParse(ClientMessage, m).success).toBe(true);
    },
  );

  test.each(Object.entries(serverValid))(
    'ServerMessage принимает %s',
    (_k, m) => {
      expect(v.safeParse(ServerMessage, m).success).toBe(true);
    },
  );

  test('ServerMessage: notification со следом или получателем — не по схеме', () => {
    expect(
      v.safeParse(ServerMessage, { ...NOTIFICATION, trace: {} }).success,
    ).toBe(false);
    expect(
      v.safeParse(ServerMessage, { ...NOTIFICATION, recipient: 'u' }).success,
    ).toBe(false);
  });

  test('ServerMessage: signal с payload — не по схеме', () => {
    const base = signal(1);
    const withPayload = {
      ...base,
      signal: { ...(base.kind === 'signal' ? base.signal : {}), payload: {} },
    };

    expect(v.safeParse(ServerMessage, withPayload).success).toBe(false);
  });

  test('ServerMessage: новое поле во вложенной форме dmg-core — по схеме, поле отброшено', () => {
    const base = signal(1);
    const withNew = [
      {
        kind: 'result',
        id: 'c1',
        result: { ok: false, error: { code: 'X', kind: 'internal', hint: 1 } },
      },
      {
        ...base,
        signal: {
          ...(base.kind === 'signal' ? base.signal : {}),
          trace: {
            cause: { kind: 'event', eventId: 'e-1', at: 1 },
            correlationId: 'e-1',
            span: 's',
          },
        },
      },
      { kind: 'hello', context: { ...CONTEXT, theme: 'dark' } },
    ];

    for (const message of withNew) {
      const parsed = v.safeParse(ServerMessage, message);
      expect(parsed.success).toBe(true);
      expect(JSON.stringify(parsed.output)).not.toMatch(/hint|"at"|span|theme/);
    }
  });

  test('ServerMessage: лишнее поле конверта — не по схеме', () => {
    const result = { kind: 'result', id: 'c1', result: ok({}) };

    expect(v.safeParse(ServerMessage, { ...result, extra: 1 }).success).toBe(
      false,
    );
  });

  test('ServerMessage: refused с id вызова — по схеме', () => {
    expect(
      v.safeParse(ServerMessage, {
        kind: 'refused',
        reason: 'malformed',
        id: 'c1',
      }).success,
    ).toBe(true);
  });
});
