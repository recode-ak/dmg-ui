import { afterEach, describe, expect, test } from 'bun:test';
import { useTempDir } from 'dmg-core/testing';
import { Browser } from './browser';
import type { BrowserPage } from './browser-page';
import { ExampleWebFixture } from './example-web-fixture';

// Калибровка подставной истории `MemoryPageHistory` в режиме `deferred` по
// настоящему Chrome: страница «Кто вы?» без скриптов приложения, записи
// истории — через `pushState`. Если версия Chrome изменит порядок событий,
// красным станет этот файл: подставу перекалибруют, клиент здесь ни при чём.
// Запускается только `bun run browser`.

const SECONDS = 30_000;
const tmp = useTempDir('history-calibration-browser-');
const stops: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(stops.splice(0).map((stop) => stop()));
});

/** Страница «Кто вы?» с тремя своими записями `/`, `/a`, `/b` и журналом `popstate`. */
const prepared = async (): Promise<BrowserPage> => {
  const fixture = await ExampleWebFixture.start(tmp().path);
  stops.push(() => fixture.stop());
  const browser = await Browser.launch();
  stops.push(() => browser.close());
  const page = await browser.newPage();
  await page.goto(fixture.origin);
  await page.evaluate(`(() => {
    history.pushState({ n: 'A' }, '', '/a');
    history.pushState({ n: 'B' }, '', '/b');
    window.popped = [];
    addEventListener('popstate', () => {
      popped.push({ path: location.pathname, state: history.state });
    });
  })()`);
  return page;
};

type Seen = { path: string; state: { n: string } | null };

/** Событие `popstate` по номеру: путь и запись на момент события. */
const popped = (page: BrowserPage, count: number) =>
  page.waitUntil(`window.popped.length === ${count}`);

describe('Chrome: порядок событий истории, на который опирается подстава', () => {
  test(
    'history.back() возвращает сразу: адрес и запись прежние после микро- и макрозадачи, popstate — позже',
    async () => {
      const page = await prepared();

      const before = await page.evaluate<{
        sync: Seen;
        micro: Seen;
        macro: Seen;
        events: number;
      }>(`(async () => {
        const now = () => ({ path: location.pathname, state: history.state });
        history.back();
        const sync = now();
        await Promise.resolve();
        const micro = now();
        await new Promise((done) => {
          const channel = new MessageChannel();
          channel.port1.onmessage = () => done(undefined);
          channel.port2.postMessage(0);
        });
        return { sync, micro, macro: now(), events: popped.length };
      })()`);

      expect(before.sync).toEqual({ path: '/b', state: { n: 'B' } });
      expect(before.micro).toEqual(before.sync);
      expect(before.macro).toEqual(before.sync);
      expect(before.events).toBe(0);
      await popped(page, 1);
      expect(await page.url()).toBe('/a');
      expect(await page.evaluate('popped[0]')).toEqual({
        path: '/a',
        state: { n: 'A' },
      });
    },
    SECONDS,
  );

  test(
    'back(); pushState(D): запись добавлена, popstate пришёл на цель back(), запись D пропала — «вперёд» ведёт к прежней записи',
    async () => {
      const page = await prepared();

      const during = await page.evaluate<{
        path: string;
        before: number;
        length: number;
      }>(`(() => {
        const before = history.length;
        history.back();
        history.pushState({ n: 'D' }, '', '/d');
        return { path: location.pathname, before, length: history.length };
      })()`);

      expect(during.path).toBe('/d');
      expect(during.length).toBe(during.before + 1);
      await popped(page, 1);
      expect(await page.url()).toBe('/a');
      expect(await page.evaluate('popped[0]')).toEqual({
        path: '/a',
        state: { n: 'A' },
      });
      await page.evaluate('history.forward()');
      await popped(page, 2);
      expect(await page.url()).toBe('/b');
      expect(await page.evaluate('popped[1]')).toEqual({
        path: '/b',
        state: { n: 'B' },
      });
    },
    SECONDS,
  );

  test(
    'back(); replaceState(C2): замена легла на запись, бывшую текущей; после «вперёд» там замена',
    async () => {
      const page = await prepared();

      await page.evaluate(`(() => {
        history.back();
        history.replaceState({ n: 'B2' }, '', '/b2');
      })()`);

      await popped(page, 1);
      expect(await page.url()).toBe('/a');
      await page.evaluate('history.forward()');
      await popped(page, 2);
      expect(await page.url()).toBe('/b2');
      expect(await page.evaluate('popped[1]')).toEqual({
        path: '/b2',
        state: { n: 'B2' },
      });
    },
    SECONDS,
  );
});
