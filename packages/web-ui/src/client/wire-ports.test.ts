import { describe, expect, test } from 'bun:test';
import { ok } from 'dmg-core';
import type { AddressJson, RefreshSignal } from 'dmg-ui';
import type {
  ClientMessage as ClientMsg,
  ServerMessage as ServerMsg,
} from '../wire/page-messages.types';
import { MAX_CLIENT_TEXT } from '../wire/page-wire.const';
import type { ClientEnd } from '../wire/page-wire.types';
import { WirePorts } from './wire-ports';

// Порты исполнителя поверх клиентского конца провода: вызов не по схеме,
// отказ подписки, отказ сервера по `id` вызова, обрыв провода, работа без
// связи, смена конца и отвод сигнала с адресом подписки. Конец провода —
// заглушка: журнал отправленного, сообщения и обрыв по команде.

const CONTEXT = {
  locale: 'ru-RU',
  timeZone: 'Asia/Oral',
  delegate: false,
  readOnly: false,
};
const ADDRESS = { screen: 'exampleUi/todo/taskList', params: { page: 0 } };
const OTHER = { screen: 'exampleUi/todo/taskCard', params: { taskId: 'x' } };
const CALL = { module: 'todo', uc: 'listTasks', input: {}, requestId: 'r-1' };
const SIGNAL: RefreshSignal = {
  event: 'todo.task.created',
  eventId: 'e-1',
  trace: { cause: { kind: 'event', eventId: 'e-1' }, correlationId: 'e-1' },
};

/** Конец провода: отправленное, сообщения сервера и обрыв — по команде теста. */
class StubEnd implements ClientEnd {
  readonly context = CONTEXT;
  readonly sent: ClientMsg[] = [];
  private readonly handlers: ((message: ServerMsg) => void)[] = [];
  private readonly breaks: ((error: Error) => void)[] = [];

  send(message: ClientMsg): void {
    this.sent.push(message);
  }

  onMessage(handler: (message: ServerMsg) => void): void {
    this.handlers.push(handler);
  }

  onBreak(handler: (error: Error) => void): void {
    this.breaks.push(handler);
  }

  close(): void {}

  emit(message: ServerMsg): void {
    for (const handler of this.handlers) handler(message);
  }

  fail(error: Error): void {
    for (const handler of this.breaks) handler(error);
  }

  /** `id` отправленных подписок по порядку. */
  watchIds(): string[] {
    return this.sent.flatMap((m) => (m.kind === 'watch' ? [m.watch] : []));
  }

  /** `id` отправленных вызовов по порядку. */
  callIds(): string[] {
    return this.sent.flatMap((m) => (m.kind === 'call' ? [m.id] : []));
  }
}

/** Сообщения сервера с конца `end` — в `receive` портов, как их отводит клиент. */
const route = (end: StubEnd, wire: WirePorts) => {
  end.onMessage((message) => {
    if (
      message.kind === 'result' ||
      message.kind === 'signal' ||
      message.kind === 'watch-refused' ||
      message.kind === 'refused'
    ) {
      wire.receive(message);
    }
  });
};

/** Порты на заглушке; сообщения сервера — в `receive` портов. */
const ports = (onSignal?: (address: AddressJson) => void) => {
  const end = new StubEnd();
  const wire = new WirePorts(end, onSignal);
  route(end, wire);
  return { end, wire };
};

/** Новый конец портам: `attach` и отвод его сообщений. */
const attached = (wire: WirePorts) => {
  const end = new StubEnd();
  wire.attach(end);
  route(end, wire);
  return end;
};

/** Отдаёт микрозадачи без таймеров (TST-04). */
const flush = async () => {
  for (let turn = 0; turn < 200; turn += 1) await Promise.resolve();
};

/** Исход промиса: значение или текст отказа — без ожидания таймером. */
const outcome = (promise: Promise<unknown>) =>
  promise.then(
    (value) => ({ value }),
    (error: unknown) => ({
      error: error instanceof Error ? error.message : String(error),
    }),
  );

/** Исход промиса к концу `flush()`: не разрешённый к этому моменту — `waiting`. */
const settledSoon = (promise: Promise<unknown>) =>
  Promise.race([outcome(promise), flush().then(() => 'waiting' as const)]);

describe('WirePorts.call', () => {
  test('вызов не по схеме провода — отказ промиса, на провод не ушёл', async () => {
    const { end, wire } = ports();

    const res = await outcome(wire.call({ ...CALL, uc: 'x'.repeat(257) }));

    expect(res).toEqual({ error: expect.stringContaining('не по схеме') });
    expect(end.sent).toEqual([]);
  });

  test('строка вызова длиннее предела провода — отказ промиса, на провод не ушёл', async () => {
    const { end, wire } = ports();
    const input = { title: 'x'.repeat(MAX_CLIENT_TEXT) };

    const res = await outcome(wire.call({ ...CALL, input }));

    expect(res).toEqual({ error: expect.stringContaining('длиннее предела') });
    expect(end.sent).toEqual([]);
  });

  test('result с тем же id — значение вызова', async () => {
    const { end, wire } = ports();

    const pending = wire.call(CALL);
    end.emit({ kind: 'result', id: end.callIds()[0] ?? '', result: ok(1) });

    expect(await pending).toEqual(ok(1));
  });

  test('refused с id вызова — отказ этого вызова, другой ждёт result', async () => {
    const { end, wire } = ports();
    const first = outcome(wire.call(CALL));
    const second = outcome(wire.call({ ...CALL, requestId: 'r-2' }));
    const [firstId = '', secondId = ''] = end.callIds();

    end.emit({ kind: 'refused', reason: 'malformed', id: firstId });
    end.emit({ kind: 'result', id: secondId, result: ok(2) });

    expect(await first).toEqual({
      error: expect.stringContaining('отклонил'),
    });
    expect(await second).toEqual({ value: ok(2) });
  });

  test('refused без id — ожидающие вызовы не тронуты', async () => {
    const { end, wire } = ports();
    const pending = outcome(wire.call(CALL));

    end.emit({ kind: 'refused', reason: 'malformed' });
    end.emit({ kind: 'result', id: end.callIds()[0] ?? '', result: ok(1) });

    expect(await pending).toEqual({ value: ok(1) });
  });

  test('обрыв провода — отказ всех ожидающих; поздний result не воскрешает', async () => {
    const { end, wire } = ports();
    const first = outcome(wire.call(CALL));
    const second = outcome(wire.call({ ...CALL, requestId: 'r-2' }));

    end.fail(new Error('провод оборван'));
    end.emit({ kind: 'result', id: end.callIds()[0] ?? '', result: ok(1) });

    expect(await first).toEqual({ error: 'провод оборван' });
    expect(await second).toEqual({ error: 'провод оборван' });
  });
});

describe('WirePorts — без связи', () => {
  test('после обрыва новый call — отказ сразу «нет соединения», на провод не ушёл', async () => {
    const { end, wire } = ports();
    const before = outcome(wire.call(CALL));
    end.fail(new Error('провод оборван'));

    const res = await settledSoon(wire.call({ ...CALL, requestId: 'r-2' }));

    expect(await before).toEqual({ error: 'провод оборван' });
    expect(res).toEqual({ error: expect.stringContaining('нет соединения') });
    expect(end.callIds()).toHaveLength(1);
  });

  test('watch после обрыва — сообщения нет; отписка — без действия', () => {
    const { end, wire } = ports();
    end.fail(new Error('провод оборван'));

    const off = wire.watch(ADDRESS, () => {});
    off();

    expect(end.sent).toEqual([]);
  });

  test('подписка до обрыва снята обрывом: сигнал по её id не доходит, отписка ничего не шлёт', () => {
    const taps: AddressJson[] = [];
    const { end, wire } = ports((address) => {
      taps.push(address);
    });
    const signals: RefreshSignal[] = [];
    const off = wire.watch(ADDRESS, (signal) => signals.push(signal));
    const [watch = ''] = end.watchIds();

    end.fail(new Error('провод оборван'));
    end.emit({ kind: 'signal', watch, signal: SIGNAL });
    off();

    expect(signals).toEqual([]);
    expect(taps).toEqual([]);
    expect(end.sent.map((m) => m.kind)).toEqual(['watch']);
  });
});

describe('WirePorts.attach', () => {
  test('после обрыва и attach(end2) — call уходит по end2, ответ по end2 разрешает', async () => {
    const { end, wire } = ports();
    end.fail(new Error('провод оборван'));
    const end2 = attached(wire);

    const pending = wire.call(CALL);
    end2.emit({ kind: 'result', id: end2.callIds()[0] ?? '', result: ok(1) });

    expect(await settledSoon(pending)).toEqual({ value: ok(1) });
    expect(end.callIds()).toEqual([]);
  });

  test('после attach подписка уходит по end2, сигнал по end2 доходит до слушателя', () => {
    const { end, wire } = ports();
    end.fail(new Error('провод оборван'));
    const end2 = attached(wire);
    const signals: RefreshSignal[] = [];

    wire.watch(ADDRESS, (signal) => signals.push(signal));
    const [watch = ''] = end2.watchIds();
    end2.emit({ kind: 'signal', watch, signal: SIGNAL });

    expect(end2.sent).toStrictEqual([
      { kind: 'watch', watch, address: ADDRESS },
    ]);
    expect(signals).toEqual([SIGNAL]);
    expect(end.sent).toEqual([]);
  });

  test('отписка подписки, сделанной до обрыва, после attach по end2 ничего не шлёт', () => {
    const { end, wire } = ports();
    const off = wire.watch(ADDRESS, () => {});
    end.fail(new Error('провод оборван'));
    const end2 = attached(wire);

    off();

    expect(end2.sent).toEqual([]);
    expect(end.sent.map((m) => m.kind)).toEqual(['watch']);
  });

  test('сигнал по прежнему концу после attach — слушатель не зван', () => {
    const { end, wire } = ports();
    const signals: RefreshSignal[] = [];
    wire.watch(ADDRESS, (signal) => signals.push(signal));
    const [watch = ''] = end.watchIds();
    end.fail(new Error('провод оборван'));
    attached(wire);

    end.emit({ kind: 'signal', watch, signal: SIGNAL });

    expect(signals).toEqual([]);
  });

  test('обрыв прежнего конца после attach вызовы нового не отказывает', async () => {
    const { end, wire } = ports();
    const end2 = attached(wire);
    const pending = wire.call(CALL);

    end.fail(new Error('прежний провод оборван'));
    end2.emit({ kind: 'result', id: end2.callIds()[0] ?? '', result: ok(2) });

    expect(await settledSoon(pending)).toEqual({ value: ok(2) });
  });
});

describe('WirePorts.watch', () => {
  test('watch-refused снимает слушателя: сигнала и отвода нет, отписка unwatch не шлёт', () => {
    const taps: AddressJson[] = [];
    const { end, wire } = ports((address) => {
      taps.push(address);
    });
    const signals: RefreshSignal[] = [];
    const off = wire.watch(ADDRESS, (signal) => signals.push(signal));
    const watch = end.sent[0]?.kind === 'watch' ? end.sent[0].watch : '';

    end.emit({ kind: 'watch-refused', watch });
    end.emit({ kind: 'signal', watch, signal: SIGNAL });
    off();

    expect(signals).toEqual([]);
    expect(taps).toEqual([]);
    expect(end.sent.map((m) => m.kind)).toEqual(['watch']);
  });
});

describe('WirePorts — отвод сигнала', () => {
  test('сигнал по подписке — сначала слушатель, затем отвод с адресом этой подписки', () => {
    const log: unknown[] = [];
    const { end, wire } = ports((address) => {
      log.push(address);
    });
    wire.watch(OTHER, () => {
      log.push('другой слушатель');
    });
    wire.watch(ADDRESS, () => {
      log.push('слушатель');
    });
    const [, watch = ''] = end.watchIds();

    end.emit({ kind: 'signal', watch, signal: SIGNAL });

    expect(log).toEqual(['слушатель', ADDRESS]);
  });

  test('снятая подписка — ни слушателя, ни отвода', () => {
    const log: unknown[] = [];
    const { end, wire } = ports((address) => {
      log.push(address);
    });
    const off = wire.watch(ADDRESS, () => {
      log.push('слушатель');
    });
    const [watch = ''] = end.watchIds();

    off();
    end.emit({ kind: 'signal', watch, signal: SIGNAL });

    expect(log).toEqual([]);
  });

  test('без отвода сигнал доходит до слушателя, как раньше', () => {
    const { end, wire } = ports();
    const signals: RefreshSignal[] = [];
    wire.watch(ADDRESS, (signal) => signals.push(signal));
    const [watch = ''] = end.watchIds();

    end.emit({ kind: 'signal', watch, signal: SIGNAL });

    expect(signals).toEqual([SIGNAL]);
  });
});
