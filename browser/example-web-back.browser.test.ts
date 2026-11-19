import { afterEach, describe, expect, test } from 'bun:test';
import { useTempDir } from 'dmg-core/testing';
import { Browser } from './browser';
import type { BrowserPage } from './browser-page';
import { ExampleWebFixture } from './example-web-fixture';

// «Назад» браузера и закрытие окна в настоящем Chrome: стек «список → меню →
// окно». Один человек, одна вкладка: меню открывается ссылкой внутри
// страницы (у него есть запись позади), окно — кнопкой «Назначенные мне».
// Ожидание — только событиями (`popstate`, изменения DOM). Запускается только
// `bun run browser`.

const SECONDS = 30_000;
const tmp = useTempDir('example-web-back-browser-');
const stops: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(stops.splice(0).map((stop) => stop()));
});

/** Условие «в основной области страницы есть текст `text`». */
const mainHas = (text: string) =>
  `document.querySelector('.region-main')?.innerText.includes(${JSON.stringify(text)}) === true`;

const WINDOW_CLOSED = `document.querySelector('dialog[open]') === null`;

/** Текущая запись истории — не запись открытия окна: клиент снял её собственным «Назад» (запись окна и запись меню на одном адресе). */
const WINDOW_RECORD_GONE = `!String(history.state).includes('"over":true')`;

/** Анна вошла, на странице список; меню открыто ссылкой, поверх него — окно «Назначенные мне». */
const windowOpened = async (): Promise<BrowserPage> => {
  const fixture = await ExampleWebFixture.start(tmp().path);
  stops.push(() => fixture.stop());
  const browser = await Browser.launch();
  stops.push(() => browser.close());
  const page = await browser.newPage();
  await fixture.enterAs(page, 'anna');
  await page.waitUntil(mainHas('Мои задачи'));
  await page.click('a[href="/menu"]');
  await page.waitUntil(mainHas('Начать работу'));
  await page.clickText('Назначенные мне', '.region-main');
  await page.waitFor('dialog[open]');
  return page;
};

const historyLength = (page: BrowserPage) =>
  page.evaluate<number>('history.length');

describe('«Назад» и окно в Chrome', () => {
  test(
    'окно открыто: «Назад» закрывает окно, запись не добавляется; ещё «Назад» — на список',
    async () => {
      const page = await windowOpened();
      const length = await historyLength(page);

      await page.back();

      await page.waitUntil(WINDOW_CLOSED);
      expect(await page.text('.region-main')).toContain('Начать работу');
      expect(await historyLength(page)).toBe(length);
      expect(await page.url()).toBe('/menu');
      await page.back();
      await page.waitUntil(mainHas('Мои задачи'));
      expect(await page.url()).toBe('/');
      expect(await page.evaluate(WINDOW_CLOSED)).toBe(true);
    },
    SECONDS,
  );

  test(
    'после закрытия окна кнопкой: «Назад» ведёт на список, закрытое окно не возвращается',
    async () => {
      const page = await windowOpened();
      const length = await historyLength(page);

      await page.clickText('Закрыть', 'dialog .region-head');

      await page.waitUntil(`${WINDOW_CLOSED} && ${WINDOW_RECORD_GONE}`);
      expect(await historyLength(page)).toBe(length);
      expect(await page.url()).toBe('/menu');
      await page.back();
      await page.waitUntil(mainHas('Мои задачи'));
      expect(await page.url()).toBe('/');
      expect(await page.evaluate(WINDOW_CLOSED)).toBe(true);
    },
    SECONDS,
  );
});
