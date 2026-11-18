import { describe, expect, test } from 'bun:test';
import { ManualPageClock } from '../../testing';
import type { ServerMessage as ServerMsg } from '../wire/page-messages.types';
import { PAGE_CLOSE } from '../wire/page-wire.const';
import type { ClientEnd } from '../wire/page-wire.types';
import { PageReconnector } from './page-reconnector';
import { RECONNECT } from './page-reconnector.const';
import type { PageSocket, PageSocketEvents } from './page-socket.types';

// Переподключатель вкладки: попытки соединения с паузой и разбросом, срок
// ожидания `hello`, верхняя ступень паузы после отказа, слежение за обрывом и
// передача нового конца. Сокет — подделка узкого порта, события подаёт тест;
// часы — подставные, разброс — переменная теста. Таймеров среды нет.

const CONTEXT = {
  locale: 'kk-KZ',
  timeZone: 'Asia/Almaty',
  delegate: false,
  readOnly: false,
} as const;
const HELLO = JSON.stringify({ kind: 'hello', context: CONTEXT });
const SIGNAL: ServerMsg = {
  kind: 'signal',
  watch: 'w1',
  signal: {
    event: 'todo.task.created',
    eventId: 'e-1',
    trace: { cause: { kind: 'event', eventId: 'e-1' }, correlationId: 'e-1' },
  },
};
/** Паузы перед попытками 1…8 подряд при `random = 0`, мс. */
const PAUSES = [250, 500, 1000, 2000, 4000, 8000, 15000, 15000];
/** Ступени паузы `d` перед попытками 1…8, мс: пауза — в `[d/2, d)`. */
const STEPS = [500, 1000, 2000, 4000, 8000, 16000, 30000, 30000];

/** Сокет: отправленное, число закрытий, события — от теста. */
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

/** Сокет, подписка на события которого бросает синхронно. */
class DeafSocket extends StubSocket {
  override listen(): void {
    throw new Error('подписка на сокет не удалась');
  }
}

/** Отдаёт микрозадачи без таймеров (TST-04). */
const flush = async () => {
  for (let turn = 0; turn < 200; turn += 1) await Promise.resolve();
};

/** Исход промиса к концу `flush()`: не разрешённый к этому моменту — «ждёт». */
const soon = (promise: Promise<unknown>) =>
  Promise.race([
    promise.then(
      () => 'разрешён',
      () => 'отклонён',
    ),
    flush().then(() => 'ждёт'),
  ]);

/**
 * Переподключатель на подставных сокетах и часах: `created` — сокеты по
 * порядку создания; `failing` — сколько следующих `sockets()` бросят;
 * `deaf` — у скольких следующих сокетов бросит подписка; `faults` — порт сбоев.
 */
const reconnector = () => {
  const clock = new ManualPageClock();
  const created: StubSocket[] = [];
  const random = { value: 0 };
  const failing = { count: 0 };
  const deaf = { count: 0 };
  const faults: unknown[] = [];
  const r = new PageReconnector({
    sockets: () => {
      if (failing.count > 0) {
        failing.count -= 1;
        throw new Error('сокет не создан');
      }
      const socket = deaf.count > 0 ? new DeafSocket() : new StubSocket();
      if (deaf.count > 0) deaf.count -= 1;
      created.push(socket);
      return socket;
    },
    clock,
    random: () => random.value,
    faults: (error) => {
      faults.push(error);
    },
  });
  const last = (): StubSocket => {
    const socket = created.at(-1);
    if (socket === undefined) throw new Error('сокетов ещё нет');
    return socket;
  };
  return { r, clock, created, random, failing, deaf, faults, last };
};

type Rig = ReturnType<typeof reconnector>;

/** Соединённый конец: первая попытка, `hello`. */
const connected = async (rig: Rig): Promise<ClientEnd> => {
  const connecting = rig.r.connect();
  await flush();
  rig.last().message(HELLO);
  return connecting;
};

/** Ждущая пауза — ровно одна; её срок. */
const pause = (rig: Rig): number => {
  const pending = rig.clock.pending();
  expect(pending).toHaveLength(1);
  return pending[0] ?? -1;
};

describe('PageReconnector.connect', () => {
  test('первая попытка — сразу; hello — конец с контекстом, срок hello снят', async () => {
    const rig = reconnector();

    const connecting = rig.r.connect();
    await flush();
    expect(rig.created).toHaveLength(1);
    rig.last().message(HELLO);
    const end = await connecting;

    expect(end.context).toEqual(CONTEXT);
    expect(rig.clock.pending()).toEqual([]);
    expect(rig.last().closes).toBe(0);
  });

  test('сбой (closed 1006) — следующая попытка через 250 мс при random = 0, не раньше', async () => {
    const rig = reconnector();
    const connecting = rig.r.connect();
    await flush();

    rig.last().closed(1006);
    await flush();
    expect(rig.clock.pending()).toEqual([250]);
    rig.clock.advance(249);
    await flush();
    expect(rig.created).toHaveLength(1);
    rig.clock.advance(1);
    await flush();

    expect(rig.created).toHaveLength(2);
    expect(await soon(connecting)).toBe('ждёт');
    rig.last().message(HELLO);
    expect(await soon(connecting)).toBe('разрешён');
  });

  test('ряд пауз при random = 0: 250, 500, 1000, 2000, 4000, 8000, 15000, 15000', async () => {
    const rig = reconnector();
    void rig.r.connect();
    await flush();
    const seen: number[] = [];

    for (let n = 0; n < PAUSES.length; n += 1) {
      rig.last().closed(1006);
      await flush();
      const next = pause(rig);
      seen.push(next);
      rig.clock.advance(next);
      await flush();
    }

    expect(seen).toEqual(PAUSES);
    expect(rig.created).toHaveLength(PAUSES.length + 1);
  });

  test('random → 1: каждая пауза меньше ступени d и не меньше d/2', async () => {
    const rig = reconnector();
    rig.random.value = 0.999999;
    void rig.r.connect();
    await flush();

    for (const step of STEPS) {
      rig.last().closed(1006);
      await flush();
      const next = pause(rig);
      expect(next).toBeLessThan(step);
      expect(next).toBeGreaterThanOrEqual(step / 2);
      rig.clock.advance(next);
      await flush();
    }
  });

  test('первый кадр не hello — как сбой: пауза 250 мс, затем новая попытка', async () => {
    const rig = reconnector();
    void rig.r.connect();
    await flush();

    rig.last().message(JSON.stringify(SIGNAL));
    await flush();
    expect(rig.clock.pending()).toEqual([250]);
    rig.clock.advance(250);
    await flush();

    expect(rig.created).toHaveLength(2);
  });

  test('отказ 4403 на первой попытке — пауза сразу верхней ступени: 15000 мс при random = 0', async () => {
    const rig = reconnector();
    void rig.r.connect();
    await flush();

    rig.last().closed(PAGE_CLOSE.refused);
    await flush();

    expect(rig.clock.pending()).toEqual([15000]);
  });

  test('отказ 4403 после двух сбоев — пауза не меньше 15000 и меньше 30000', async () => {
    const rig = reconnector();
    rig.random.value = 0.999999;
    void rig.r.connect();
    await flush();
    for (let n = 0; n < 2; n += 1) {
      rig.last().closed(1006);
      await flush();
      rig.clock.advance(pause(rig));
      await flush();
    }

    rig.last().closed(PAGE_CLOSE.refused);
    await flush();

    const next = pause(rig);
    expect(next).toBeGreaterThanOrEqual(15000);
    expect(next).toBeLessThan(30000);
  });

  test('нет hello 9 999 мс — сокет открыт; 10 000 мс — сокет закрыт, следующая попытка через паузу', async () => {
    const rig = reconnector();
    const connecting = rig.r.connect();
    await flush();
    expect(rig.clock.pending()).toEqual([10000]);

    rig.clock.advance(9999);
    await flush();
    expect(rig.last().closes).toBe(0);
    rig.clock.advance(1);
    await flush();

    expect(rig.last().closes).toBe(1);
    expect(rig.clock.pending()).toEqual([250]);
    expect(await soon(connecting)).toBe('ждёт');
  });

  test('бросок sockets() — как сбой closed: пауза 250 мс, затем новая попытка', async () => {
    const rig = reconnector();
    rig.failing.count = 1;

    const connecting = rig.r.connect();
    await flush();
    expect(rig.created).toEqual([]);
    expect(rig.clock.pending()).toEqual([250]);
    rig.clock.advance(250);
    await flush();
    rig.last().message(HELLO);

    expect(await soon(connecting)).toBe('разрешён');
  });
});

describe('PageReconnector — сбои среды', () => {
  test('бросок sockets() — в faults', async () => {
    const rig = reconnector();
    rig.failing.count = 1;

    void rig.r.connect();
    await flush();

    expect(rig.faults).toEqual([new Error('сокет не создан')]);
  });

  test('синхронный бросок подписки на сокет — в faults, сокет закрыт; пауза 250 мс, затем новая попытка', async () => {
    const rig = reconnector();
    rig.deaf.count = 1;

    const connecting = rig.r.connect();
    await flush();
    expect(rig.faults).toEqual([new Error('подписка на сокет не удалась')]);
    expect(rig.last().closes).toBe(1);
    expect(rig.clock.pending()).toEqual([250]);
    rig.clock.advance(250);
    await flush();
    rig.last().message(HELLO);

    expect(await soon(connecting)).toBe('разрешён');
    expect(rig.created).toHaveLength(2);
  });
});

describe('PageReconnector.follow', () => {
  test('обрыв конца — пауза, попытка, attach(next) один раз; обрыв next — снова', async () => {
    const rig = reconnector();
    const end = await connected(rig);
    const attached: ClientEnd[] = [];
    rig.r.follow(end, (next) => {
      attached.push(next);
    });

    rig.last().closed(1006);
    await flush();
    expect(attached).toEqual([]);
    rig.clock.advance(pause(rig));
    await flush();
    rig.last().message(HELLO);
    await flush();
    expect(attached).toHaveLength(1);
    expect(attached[0]).not.toBe(end);

    rig.last().closed(1001);
    await flush();
    rig.clock.advance(pause(rig));
    await flush();
    rig.last().message(HELLO);
    await flush();

    expect(attached).toHaveLength(2);
    expect(rig.created).toHaveLength(3);
  });

  test('счёт пауз сброшен обрывом соединения, прожившего stableMs: после двух сбоев и соединения обрыв снова даёт 250 мс', async () => {
    const rig = reconnector();
    const connecting = rig.r.connect();
    await flush();
    for (let n = 0; n < 2; n += 1) {
      rig.last().closed(1006);
      await flush();
      rig.clock.advance(pause(rig));
      await flush();
    }
    rig.last().message(HELLO);
    const end = await connecting;
    rig.r.follow(end, () => {});
    rig.clock.advance(RECONNECT.stableMs);

    rig.last().closed(1006);
    await flush();

    expect(rig.clock.pending()).toEqual([250]);
  });

  test('hello и сразу обрыв подряд — пауза растёт: 250, 500, 1000, 2000 при random = 0', async () => {
    const rig = reconnector();
    const end = await connected(rig);
    rig.r.follow(end, () => {});
    const seen: number[] = [];

    for (let n = 0; n < 4; n += 1) {
      rig.last().closed(1006);
      await flush();
      const next = pause(rig);
      seen.push(next);
      rig.clock.advance(next);
      await flush();
      rig.last().message(HELLO);
      await flush();
    }

    expect(seen).toEqual([250, 500, 1000, 2000]);
  });

  test('follow второго конца снимает слежение с первого: обрыв первого попыток не даёт, обрыв второго — даёт', async () => {
    const rig = reconnector();
    const first = await connected(rig);
    const second = await connected(rig);
    const [firstSocket, secondSocket] = rig.created;
    rig.r.follow(first, () => {});
    rig.r.follow(second, () => {});

    firstSocket?.closed(1006);
    await flush();
    expect(rig.clock.pending()).toEqual([]);
    rig.clock.advance(60000);
    await flush();
    expect(rig.created).toHaveLength(2);
    secondSocket?.closed(1006);
    await flush();
    rig.clock.advance(pause(rig));
    await flush();

    expect(rig.created).toHaveLength(3);
  });

  test.each([
    [
      'бросил',
      () => {
        throw new Error('attach сломан');
      },
    ],
    ['отказал промисом', () => Promise.reject(new Error('attach сломан'))],
  ])(
    'attach %s — ошибка в faults; после следующего обрыва попытки продолжаются',
    async (_, attach) => {
      const rig = reconnector();
      const end = await connected(rig);
      rig.r.follow(end, attach);

      rig.last().closed(1006);
      await flush();
      rig.clock.advance(pause(rig));
      await flush();
      rig.last().message(HELLO);
      await flush();
      expect(rig.faults).toEqual([new Error('attach сломан')]);
      rig.last().closed(1006);
      await flush();
      rig.clock.advance(pause(rig));
      await flush();

      expect(rig.created).toHaveLength(3);
    },
  );

  test('опоздавший hello после срока — его конец закрыт, attach не звался; следующая пауза — следующей ступени', async () => {
    const rig = reconnector();
    const end = await connected(rig);
    const attached: ClientEnd[] = [];
    rig.r.follow(end, (next) => {
      attached.push(next);
    });
    rig.last().closed(1006);
    await flush();
    rig.clock.advance(pause(rig));
    await flush();

    rig.clock.advance(10000);
    await flush();
    const late = rig.last();
    expect(late.closes).toBe(1);
    late.message(HELLO);
    await flush();

    expect(late.closes).toBe(2);
    expect(attached).toEqual([]);
    expect(rig.clock.pending()).toEqual([500]);
  });

  test('attach получает конец раньше любого кадра: hello и сигнал выданы синхронно подряд — обработчик attach получил сигнал', async () => {
    const rig = reconnector();
    const end = await connected(rig);
    const received: ServerMsg[] = [];
    rig.r.follow(end, (next) => {
      next.onMessage((message) => {
        received.push(message);
      });
    });
    rig.last().closed(1006);
    await flush();
    rig.clock.advance(pause(rig));
    await flush();

    rig.last().message(HELLO);
    rig.last().message(JSON.stringify(SIGNAL));
    await flush();

    expect(received).toStrictEqual([SIGNAL]);
  });
});

describe('PageReconnector.close', () => {
  test('close() во время паузы — ждущих вызовов нет, попыток нет; connect отклонён', async () => {
    const rig = reconnector();
    const connecting = rig.r.connect();
    await flush();
    rig.last().closed(1006);
    await flush();
    expect(rig.clock.pending()).toEqual([250]);

    rig.r.close();
    rig.clock.advance(60000);
    await flush();

    expect(rig.clock.pending()).toEqual([]);
    expect(rig.created).toHaveLength(1);
    expect(await soon(connecting)).toBe('отклонён');
    expect(await soon(rig.r.connect())).toBe('отклонён');
  });

  test('close() во время попытки — сокет закрыт, срока hello нет, connect отклонён; опоздавший hello новых сокетов не даёт', async () => {
    const rig = reconnector();
    const connecting = rig.r.connect();
    await flush();
    expect(rig.clock.pending()).toEqual([10000]);

    rig.r.close();
    expect(rig.last().closes).toBe(1);
    expect(rig.clock.pending()).toEqual([]);
    expect(await soon(connecting)).toBe('отклонён');
    rig.last().message(HELLO);
    await flush();
    rig.clock.advance(60000);
    await flush();

    expect(rig.created).toHaveLength(1);
    expect(rig.clock.pending()).toEqual([]);
  });

  test('close() после follow — текущий конец закрыт; его обрыв новых попыток не даёт', async () => {
    const rig = reconnector();
    const end = await connected(rig);
    const attached: ClientEnd[] = [];
    rig.r.follow(end, (next) => {
      attached.push(next);
    });

    rig.r.close();
    rig.last().closed(1000);
    await flush();
    rig.clock.advance(60000);
    await flush();

    expect(rig.last().closes).toBe(1);
    expect(rig.clock.pending()).toEqual([]);
    expect(rig.created).toHaveLength(1);
    expect(attached).toEqual([]);
  });
});
