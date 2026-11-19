import { afterEach, describe, expect, test } from 'bun:test';
import { CdpConnection } from './cdp-connection';

// Настоящий WebSocket на `Bun.serve` (порт 0), протокол DevTools — JSON:
// запрос `{ id, method, params, sessionId }`, ответ `{ id, result | error }`,
// событие `{ method, params, sessionId }`. Ожидание — ответами и событиями,
// не таймерами (TST-04).

type Request = {
  id: number;
  method: string;
  params?: Record<string, unknown>;
  sessionId?: string;
};

const stops: Array<() => void> = [];
afterEach(() => {
  for (const stop of stops.splice(0)) stop();
});

/** Сервер-двойник Chrome: поведение задаёт `method` запроса. */
const startServer = () => {
  const held: Array<{ id: number; ws: Bun.ServerWebSocket<unknown> }> = [];
  const server = Bun.serve({
    port: 0,
    fetch: (request, srv) =>
      srv.upgrade(request)
        ? undefined
        : new Response('нужен WebSocket', { status: 426 }),
    websocket: {
      message(ws, raw) {
        const request = JSON.parse(String(raw)) as Request;
        if (request.method === 'echo') {
          ws.send(JSON.stringify({ id: request.id, result: request.params }));
        } else if (request.method === 'fail') {
          ws.send(
            JSON.stringify({
              id: request.id,
              error: { code: -32601, message: 'нет такого метода' },
            }),
          );
        } else if (request.method === 'hang') {
          // Ответа нет: запрос остаётся ожидающим.
        } else if (request.method === 'drop') {
          ws.close();
        } else if (request.method === 'emit') {
          for (const sessionId of ['s1', 's2']) {
            ws.send(
              JSON.stringify({
                method: 'Page.loadEventFired',
                params: { from: sessionId },
                sessionId,
              }),
            );
          }
          ws.send(JSON.stringify({ id: request.id, result: {} }));
        } else if (request.method === 'pair') {
          // Ответы на два запроса уходят в обратном порядке.
          held.push({ id: request.id, ws });
          if (held.length === 2) {
            for (const item of held.splice(0).reverse()) {
              item.ws.send(
                JSON.stringify({ id: item.id, result: { id: item.id } }),
              );
            }
          }
        }
      },
    },
  });
  stops.push(() => server.stop(true));
  return `ws://127.0.0.1:${server.port}`;
};

describe('CdpConnection', () => {
  test('send возвращает result ответа с тем же id', async () => {
    const connection = await CdpConnection.open(startServer());
    stops.push(() => connection.close());

    const result = await connection.send('echo', { value: 7 });

    expect(result).toEqual({ value: 7 });
  });

  test('error в ответе — бросок с именем метода', async () => {
    const connection = await CdpConnection.open(startServer());
    stops.push(() => connection.close());

    await expect(connection.send('fail')).rejects.toThrow('fail');
  });

  test('закрытие сокета отклоняет все ожидающие запросы', async () => {
    const connection = await CdpConnection.open(startServer());
    stops.push(() => connection.close());

    const first = connection.send('hang');
    const second = connection.send('hang');
    const third = connection.send('drop');

    const outcomes = await Promise.allSettled([first, second, third]);

    expect(outcomes.map((outcome) => outcome.status)).toEqual([
      'rejected',
      'rejected',
      'rejected',
    ]);
  });

  test('once ловит событие своей сессии, чужие пропускает', async () => {
    const connection = await CdpConnection.open(startServer());
    stops.push(() => connection.close());

    const fired = connection.once('Page.loadEventFired', 's2');
    await connection.send('emit');

    expect(await fired).toEqual({ from: 's2' });
  });

  test('параллельные send не путаются: каждый получает свой ответ', async () => {
    const connection = await CdpConnection.open(startServer());
    stops.push(() => connection.close());

    const [first, second] = await Promise.all([
      connection.send<{ id: number }>('pair'),
      connection.send<{ id: number }>('pair'),
    ]);

    expect(first.id).not.toBe(second.id);
    expect(first.id).toBeLessThan(second.id);
  });

  test('close идемпотентен', async () => {
    const connection = await CdpConnection.open(startServer());

    await connection.close();
    await connection.close();
  });
});
