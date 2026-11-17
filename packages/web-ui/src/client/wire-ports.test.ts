import { describe, expect, test } from 'bun:test';
import { ok } from 'dmg-core';
import type { RefreshSignal } from 'dmg-ui';
import type {
  ClientMessage as ClientMsg,
  ServerMessage as ServerMsg,
} from '../wire/page-messages.types';
import { MAX_CLIENT_TEXT } from '../wire/page-wire.const';
import type { ClientEnd } from '../wire/page-wire.types';
import { WirePorts } from './wire-ports';

// Порты исполнителя поверх клиентского конца провода: вызов не по схеме,
// отказ подписки, отказ сервера по `id` вызова и обрыв провода. Конец
// провода — заглушка: журнал отправленного, сообщения и обрыв по команде.

const CONTEXT = {
  locale: 'ru-RU',
  timeZone: 'Asia/Oral',
  delegate: false,
  readOnly: false,
};
const ADDRESS = { screen: 'exampleUi/todo/taskList', params: { page: 0 } };
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

  /** `id` отправленных вызовов по порядку. */
  callIds(): string[] {
    return this.sent.flatMap((m) => (m.kind === 'call' ? [m.id] : []));
  }
}

/** Порты на заглушке; сообщения сервера — в `receive` портов. */
const ports = () => {
  const end = new StubEnd();
  const wire = new WirePorts(end);
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
  return { end, wire };
};

/** Исход промиса: значение или текст отказа — без ожидания таймером. */
const outcome = (promise: Promise<unknown>) =>
  promise.then(
    (value) => ({ value }),
    (error: unknown) => ({
      error: error instanceof Error ? error.message : String(error),
    }),
  );

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

describe('WirePorts.watch', () => {
  test('watch-refused снимает слушателя: сигнала нет, отписка unwatch не шлёт', () => {
    const { end, wire } = ports();
    const signals: RefreshSignal[] = [];
    const off = wire.watch(ADDRESS, (signal) => signals.push(signal));
    const watch = end.sent[0]?.kind === 'watch' ? end.sent[0].watch : '';

    end.emit({ kind: 'watch-refused', watch });
    end.emit({ kind: 'signal', watch, signal: SIGNAL });
    off();

    expect(signals).toEqual([]);
    expect(end.sent.map((m) => m.kind)).toEqual(['watch']);
  });
});
