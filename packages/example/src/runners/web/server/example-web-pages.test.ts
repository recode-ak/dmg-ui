import { afterEach, describe, expect, test } from 'bun:test';
import { MemoryLogger, useTempDir } from 'dmg-core/testing';
import { EXAMPLE_COOKIE, EXAMPLE_PATHS } from '../common/example-web.const';
import { ExampleWebServer } from './example-web-server';

// Cookie пропуска на странице: правило как у `PageGate` — ровно одно вхождение
// имени. Негодное значение — страница выбора, не приложение и не сбой.

const tmp = useTempDir('example-web-pages-');
const stops: (() => Promise<void>)[] = [];

afterEach(async () => {
  await Promise.all(stops.splice(0).map((stop) => stop()));
});

const start = async () => {
  const server = await ExampleWebServer.start({
    port: 0,
    dataDir: tmp().path,
    delayMs: 0,
    logger: new MemoryLogger(),
  });
  stops.push(() => server.stop());
  return server;
};

const passOf = async (port: number, origin: string): Promise<string> => {
  const response = await fetch(
    `http://127.0.0.1:${port}${EXAMPLE_PATHS.enter}anna`,
    { method: 'POST', headers: { Origin: origin }, redirect: 'manual' },
  );
  const token = (response.headers.getSetCookie()[0] ?? '').match(
    new RegExp(`^${EXAMPLE_COOKIE}=([^;]*)`),
  )?.[1];
  if (token === undefined) throw new Error('нет пропуска');
  return token;
};

const pageWith = async (port: number, cookie: string) => {
  const response = await fetch(`http://127.0.0.1:${port}/`, {
    headers: { Cookie: cookie },
  });
  return { status: response.status, html: await response.text() };
};

describe('страница и cookie пропуска', () => {
  test('два вхождения cookie с пропуском — страница выбора', async () => {
    const s = await start();
    const token = await passOf(s.port, s.origins[0] ?? '');

    const { status, html } = await pageWith(
      s.port,
      `${EXAMPLE_COOKIE}=${token}; ${EXAMPLE_COOKIE}=${token}`,
    );

    expect(status).toBe(200);
    expect(html).toContain('Кто вы?');
    expect(html).not.toContain(EXAMPLE_PATHS.app);
  });

  for (const [name, value] of [
    ['пустое', ''],
    ['с пробелами', 'a b c'],
    ['длиннее 43 знаков', 'A'.repeat(100)],
  ] as const) {
    test(`мусорное значение (${name}) — страница выбора, без 500`, async () => {
      const s = await start();

      const { status, html } = await pageWith(
        s.port,
        `${EXAMPLE_COOKIE}=${value}`,
      );

      expect(status).toBe(200);
      expect(html).toContain('Кто вы?');
    });
  }
});
