import { afterEach, describe, expect, test } from 'bun:test';
import { MemoryLogger, useTempDir } from 'dmg-core/testing';
import {
  AssignedTasksScreenDef,
  exampleCodes,
  MemoryUiObserver,
} from 'dmg-ui/testing';
import {
  MAX_CLIENT_TEXT,
  PageBrowserSocket,
  PageClient,
  PageSocketEnd,
} from 'dmg-ui/web-ui';
import { ExamplePagesAppDef, examplePageRoutes } from 'dmg-ui/web-ui/testing';
import { EXAMPLE_PEOPLE } from '../common/example-people.const';
import { EXAMPLE_COOKIE, EXAMPLE_PATHS } from '../common/example-web.const';
import { ExampleTokens } from './example-tokens';
import { ExampleWebServer } from './example-web-server';
import { SOCKET_OPTIONS } from './example-web-server.const';

// Привязка `Bun.serve` примера на настоящем сокете: порт 0, каталог данных —
// временный, ожидание — событиями (кадр, закрытие, ответ). Страницы и служебные
// пути, вход с проверкой `Origin`, ворота сокета, личность по пропуску, пределы
// и освобождение места, лог без секретов, остановка. Сквозной сценарий двух
// людей — в `example-web-story.test.ts`.

const tmp = useTempDir('example-web-server-');
const stops: (() => Promise<void>)[] = [];

afterEach(async () => {
  await Promise.all(stops.splice(0).map((stop) => stop()));
});

type Started = Awaited<ReturnType<typeof ExampleWebServer.start>>;

/** Сервер на свободном порту над временным каталогом данных. */
const start = async (log = new MemoryLogger()): Promise<Started> => {
  const server = await ExampleWebServer.start({
    port: 0,
    dataDir: tmp().path,
    delayMs: 0,
    logger: log,
  });
  stops.push(() => server.stop());
  return server;
};

const base = (s: Started) => `http://127.0.0.1:${s.port}`;

const person = (key: string) => {
  const found = EXAMPLE_PEOPLE.find((candidate) => candidate.key === key);
  if (found === undefined) throw new Error(`нет человека ${key}`);
  return found;
};

/** Вход: `POST /_enter/<ключ>` с источником из списка сервера (`null` — без заголовка); пропуск — из `Set-Cookie`. */
const enter = async (
  s: Started,
  key: string,
  origin: string | null = s.origins[0] ?? null,
) => {
  const response = await fetch(`${base(s)}${EXAMPLE_PATHS.enter}${key}`, {
    method: 'POST',
    headers: origin === null ? {} : { Origin: origin },
    redirect: 'manual',
  });
  const cookie = response.headers.getSetCookie()[0] ?? '';
  const token = cookie.match(new RegExp(`^${EXAMPLE_COOKIE}=([^;]*)`))?.[1];
  return { response, cookie, token };
};

/** Пропуск человека, выданный входом; нет — бросок теста. */
const passOf = async (s: Started, key: string): Promise<string> => {
  const { token } = await enter(s, key);
  if (token === undefined) throw new Error(`вход ${key}: пропуска нет`);
  return token;
};

const page = (s: Started, path: string, token?: string) =>
  fetch(`${base(s)}${path}`, {
    headers:
      token === undefined ? {} : { Cookie: `${EXAMPLE_COOKIE}=${token}` },
    redirect: 'manual',
  });

const socketUrl = (s: Started) =>
  `ws://127.0.0.1:${s.port}${EXAMPLE_PATHS.socket}`;

const headersFor = (token: string, origin: string) => ({
  Origin: origin,
  Cookie: `${EXAMPLE_COOKIE}=${token}`,
});

/** Клиентский конец поверх настоящего сокета Bun. */
const endOf = (s: Started, headers: Record<string, string>) =>
  PageSocketEnd.connect(
    new PageBrowserSocket(new WebSocket(socketUrl(s), { headers })),
  );

describe('страницы и служебные пути', () => {
  test('GET / без cookie — страница выбора «Кто вы?», клиента нет', async () => {
    const s = await start();

    const response = await page(s, '/');
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(html).toContain('Кто вы?');
    expect(html).not.toContain(EXAMPLE_PATHS.app);
  });

  test('неизвестный пропуск — то же, что без cookie', async () => {
    const s = await start();

    const html = await (await page(s, '/', 'Z'.repeat(43))).text();

    expect(html).toContain('Кто вы?');
    expect(html).not.toContain(EXAMPLE_PATHS.app);
  });

  test('годный пропуск — приложение с клиентом и именем человека', async () => {
    const s = await start();
    const anna = await passOf(s, 'anna');
    const boris = await passOf(s, 'boris');

    const annaHtml = await (await page(s, '/', anna)).text();
    const borisHtml = await (await page(s, '/', boris)).text();

    expect(annaHtml).toContain(EXAMPLE_PATHS.app);
    expect(annaHtml).toContain('Анна');
    expect(annaHtml).not.toContain('Кто вы?');
    expect(borisHtml).toContain('Борис');
  });

  for (const path of ['/нет/такого/пути', '/?_side=x', '/assigned']) {
    test(`«${path}» с пропуском — страница приложения, не 404`, async () => {
      const s = await start();
      const token = await passOf(s, 'anna');

      const response = await page(s, path, token);

      expect(response.status).toBe(200);
      expect(await response.text()).toContain(EXAMPLE_PATHS.app);
    });

    test(`«${path}» без пропуска — страница выбора, не 404`, async () => {
      const s = await start();

      const response = await page(s, path);

      expect(response.status).toBe(200);
      expect(await response.text()).toContain('Кто вы?');
    });
  }

  test('заголовки страницы: политика с источниками сокета на порту сервера, nosniff, no-store', async () => {
    const s = await start();
    const token = await passOf(s, 'anna');

    const response = await page(s, '/', token);
    const csp = response.headers.get('content-security-policy') ?? '';

    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain(`ws://localhost:${s.port}`);
    expect(csp).toContain(`ws://127.0.0.1:${s.port}`);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  test('/_app.js — 200, скрипт, код клиента', async () => {
    const s = await start();
    const token = await passOf(s, 'anna');

    const response = await page(s, EXAMPLE_PATHS.app, token);
    const code = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('javascript');
    expect(code).toContain('randomUUID');
    expect(code).not.toContain('Bun.');
  });

  test('/_app.css — 200, стили', async () => {
    const s = await start();

    const response = await page(s, EXAMPLE_PATHS.styles);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/css');
    expect((await response.text()).length).toBeGreaterThan(0);
  });

  test('неизвестный служебный путь /_… — 404', async () => {
    const s = await start();
    const token = await passOf(s, 'anna');

    expect((await page(s, '/_unknown', token)).status).toBe(404);
    expect((await page(s, '/_app.js.map', token)).status).toBe(404);
  });

  test('/favicon.ico — 204', async () => {
    const s = await start();

    expect((await page(s, '/favicon.ico')).status).toBe(204);
  });

  for (const method of ['POST', 'PUT', 'DELETE']) {
    test(`${method} на страницу — 405`, async () => {
      const s = await start();

      const response = await fetch(`${base(s)}/assigned`, { method });

      expect(response.status).toBe(405);
    });
  }

  test('POST / — 405', async () => {
    const s = await start();

    expect((await fetch(`${base(s)}/`, { method: 'POST' })).status).toBe(405);
  });

  test('origins — localhost и 127.0.0.1 на порту сервера', async () => {
    const s = await start();

    expect([...s.origins].sort()).toEqual([
      `http://127.0.0.1:${s.port}`,
      `http://localhost:${s.port}`,
    ]);
  });
});

describe('вход — POST /_enter/<ключ>', () => {
  test('годный Origin: 303 на /, cookie HttpOnly; SameSite=Strict; Path=/, без Secure и срока', async () => {
    const s = await start();

    const { response, cookie, token } = await enter(s, 'anna');

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/');
    expect(cookie.startsWith(`${EXAMPLE_COOKIE}=`)).toBe(true);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/');
    expect(cookie).not.toContain('Secure');
    expect(cookie).not.toContain('Max-Age');
    expect(cookie).not.toContain('Expires');
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  test('пропуск в cookie — пропуск человека из каталога данных', async () => {
    const s = await start();
    const anna = await passOf(s, 'anna');
    const boris = await passOf(s, 'boris');

    const tokens = await ExampleTokens.open(tmp().path);

    expect(tokens.tokenOf('anna')).toBe(anna);
    expect(tokens.tokenOf('boris')).toBe(boris);
    expect(anna).not.toBe(boris);
  });

  test('оба источника из списка годны', async () => {
    const s = await start();

    for (const origin of s.origins) {
      expect((await enter(s, 'boris', origin)).response.status).toBe(303);
    }
  });

  test('чужой Origin — 403, cookie нет', async () => {
    const s = await start();

    for (const origin of ['http://evil.example', 'http://localhost:1']) {
      const { response, cookie } = await enter(s, 'anna', origin);

      expect(response.status).toBe(403);
      expect(cookie).toBe('');
    }
  });

  test('без Origin — 403, cookie нет', async () => {
    const s = await start();

    const { response, cookie } = await enter(s, 'anna', null);

    expect(response.status).toBe(403);
    expect(cookie).toBe('');
  });

  test('неизвестный ключ при годном Origin — 404, cookie нет', async () => {
    const s = await start();

    const { response, cookie } = await enter(s, 'nobody');

    expect(response.status).toBe(404);
    expect(cookie).toBe('');
  });

  test('сначала источник, потом ключ: чужой Origin и неизвестный ключ — 403', async () => {
    const s = await start();

    expect(
      (await enter(s, 'nobody', 'http://evil.example')).response.status,
    ).toBe(403);
  });

  test('GET /_enter/anna — 405', async () => {
    const s = await start();

    const response = await page(s, `${EXAMPLE_PATHS.enter}anna`);

    expect(response.status).toBe(405);
    expect(response.headers.getSetCookie()).toEqual([]);
  });
});

describe('сокет — ворота', () => {
  test('без Origin, с чужим Origin, без cookie, с неизвестным пропуском — hello не приходит', async () => {
    const s = await start();
    const token = await passOf(s, 'anna');
    const origin = s.origins[0] ?? '';

    const attempts: Record<string, string>[] = [
      { Cookie: `${EXAMPLE_COOKIE}=${token}` },
      headersFor(token, 'http://evil.example'),
      { Origin: origin },
      headersFor('Z'.repeat(43), origin),
      headersFor('', origin),
    ];

    for (const headers of attempts) {
      expect((await endOf(s, headers)).ok).toBe(false);
    }
  });

  test('годные Origin и пропуск — hello, соединение принято', async () => {
    const s = await start();
    const token = await passOf(s, 'anna');

    for (const origin of s.origins) {
      const res = await endOf(s, headersFor(token, origin));

      expect(res.ok).toBe(true);
      if (res.ok) res.value.close();
    }
  });

  test('пропуск Бориса не открывает соединение Анны: личность — по пропуску', async () => {
    const s = await start();
    const anna = await passOf(s, 'anna');
    const boris = await passOf(s, 'boris');
    const origin = s.origins[0] ?? '';

    const tab = async (token: string, prefix: string) => {
      const res = await endOf(s, headersFor(token, origin));
      if (!res.ok) throw new Error('отказ соединения');
      let n = 0;
      const client = new PageClient({
        app: ExamplePagesAppDef,
        codes: exampleCodes(),
        routes: examplePageRoutes,
        end: res.value,
        placements: [{ screen: AssignedTasksScreenDef, region: 'modal' }],
        observer: new MemoryUiObserver(),
        requestIds: () => {
          n += 1;
          return `${prefix}-${n}`;
        },
      });
      await client.route('/');
      return client;
    };
    const a = await tab(anna, 'a');
    const b = await tab(boris, 'b');

    await a.submit('main', 'create', { title: 'Хлеб' });
    await b.submit('main', 'create', { title: 'Молоко' });

    expect(JSON.stringify(a.region('main').view?.data)).toContain('Хлеб');
    expect(JSON.stringify(a.region('main').view?.data)).not.toContain('Молоко');
    expect(JSON.stringify(b.region('main').view?.data)).toContain('Молоко');
    expect(JSON.stringify(b.region('main').view?.data)).not.toContain('Хлеб');
    expect(person('anna').uuid).not.toBe(person('boris').uuid);
  });
});

/** Сырой сокет: принято ли соединение (hello до закрытия) и закрытие. */
const raw = (s: Started, token: string, origin: string) => {
  const ws = new WebSocket(socketUrl(s), {
    headers: headersFor(token, origin),
  });
  const frames: unknown[] = [];
  const hello = Promise.withResolvers<boolean>();
  const closed = Promise.withResolvers<void>();
  const waiters: {
    until: (m: { kind?: string; id?: string }) => boolean;
    resolve: (m: unknown) => void;
  }[] = [];
  ws.onmessage = (event) => {
    const message = JSON.parse(String(event.data)) as {
      kind?: string;
      id?: string;
    };
    frames.push(message);
    if (message.kind === 'hello') hello.resolve(true);
    for (const waiter of [...waiters]) {
      if (!waiter.until(message)) continue;
      waiters.splice(waiters.indexOf(waiter), 1);
      waiter.resolve(message);
    }
  };
  ws.onclose = () => {
    hello.resolve(false);
    closed.resolve();
  };
  ws.onerror = () => {
    hello.resolve(false);
  };
  return {
    ws,
    accepted: hello.promise,
    closed: closed.promise,
    until: (until: (m: { kind?: string; id?: string }) => boolean) =>
      new Promise<unknown>((resolve) => waiters.push({ until, resolve })),
  };
};

describe('сокет — пределы и освобождение места', () => {
  test('кадр длиной предела клиента проходит: соединение живо, следующий вызов получает ответ', async () => {
    const s = await start();
    const client = raw(s, await passOf(s, 'anna'), s.origins[0] ?? '');
    expect(await client.accepted).toBe(true);

    client.ws.send('x'.repeat(MAX_CLIENT_TEXT));
    client.ws.send(
      JSON.stringify({
        kind: 'call',
        id: 'c1',
        call: { module: 'todo', uc: 'listTasks', input: {}, requestId: 'r-1' },
      }),
    );
    const result = await client.until(
      (m) => m.kind === 'result' && m.id === 'c1',
    );

    expect(result).toMatchObject({ kind: 'result', id: 'c1' });
    client.ws.close();
    await client.closed;
  });

  test('строка длиннее 3 × MAX_CLIENT_TEXT закрывает сокет', async () => {
    const s = await start();
    const client = raw(s, await passOf(s, 'anna'), s.origins[0] ?? '');
    expect(await client.accepted).toBe(true);

    client.ws.send('x'.repeat(3 * MAX_CLIENT_TEXT + 1));

    await client.closed;
    expect(client.ws.readyState).toBe(WebSocket.CLOSED);
  });

  test('девять открытий и закрытий одного человека подряд проходят: предел восьми не копится', async () => {
    const s = await start();
    const token = await passOf(s, 'anna');
    const origin = s.origins[0] ?? '';

    for (let n = 1; n <= 9; n += 1) {
      // Закрытие на сервере идёт чуть позже закрытия у клиента: повтор до
      // принятия — события, а не таймеры.
      let accepted = false;
      for (let attempt = 0; attempt < 200 && !accepted; attempt += 1) {
        const client = raw(s, token, origin);
        accepted = await client.accepted;
        client.ws.close();
        await client.closed;
      }
      expect({ n, accepted }).toEqual({ n, accepted: true });
    }
  });
});

describe('SOCKET_OPTIONS — значения привязки', () => {
  test('предел кадра клиента — 3 байта на знак предела строки', () => {
    expect(SOCKET_OPTIONS.maxPayloadLength).toBe(3 * MAX_CLIENT_TEXT);
  });

  test('очередь отправки — не меньше трёх строк сервера, при переполнении сокет закрывается', async () => {
    const { MAX_SERVER_TEXT } = await import('dmg-ui/web-ui');

    expect(SOCKET_OPTIONS.backpressureLimit).toBe(3 * MAX_SERVER_TEXT);
    expect(SOCKET_OPTIONS.closeOnBackpressureLimit).toBe(true);
  });

  test('пульс включён, срок молчания — от 60 до 120 секунд', () => {
    expect(SOCKET_OPTIONS.sendPings).toBe(true);
    expect(SOCKET_OPTIONS.idleTimeout).toBeGreaterThanOrEqual(60);
    expect(SOCKET_OPTIONS.idleTimeout).toBeLessThanOrEqual(120);
  });
});

describe('лог и остановка', () => {
  test('в записях логгера нет пропусков, пары cookie, источников запросов и текста бросков', async () => {
    const log = new MemoryLogger();
    const s = await start(log);
    const anna = await passOf(s, 'anna');
    const boris = await passOf(s, 'boris');
    const origin = s.origins[0] ?? '';

    await enter(s, 'anna', 'http://evil.example');
    await enter(s, 'nobody');
    await page(s, '/нет/такого', anna);
    await endOf(s, headersFor(anna, 'http://evil.example'));
    await endOf(s, headersFor('Z'.repeat(43), origin));
    const open = await endOf(s, headersFor(boris, origin));
    if (open.ok) open.value.close();
    const client = raw(s, anna, origin);
    await client.accepted;
    client.ws.send('{не json');
    client.ws.close();
    await client.closed;

    const text = JSON.stringify(log.records);
    for (const secret of [
      anna,
      boris,
      `${EXAMPLE_COOKIE}=`,
      'evil.example',
      'не json',
    ]) {
      expect(text).not.toContain(secret);
    }
  });

  test('stop закрывает сокеты: у клиента обрыв', async () => {
    const s = await start();
    const res = await endOf(
      s,
      headersFor(await passOf(s, 'anna'), s.origins[0] ?? ''),
    );
    if (!res.ok) throw new Error('отказ соединения');
    const broken = Promise.withResolvers<void>();
    res.value.onBreak(() => broken.resolve());

    await s.stop();
    await broken.promise;

    await expect(page(s, '/')).rejects.toBeDefined();
  });

  test('повторный stop — без действия, не бросает', async () => {
    const s = await start();

    await s.stop();

    await expect(s.stop()).resolves.toBeUndefined();
  });
});
