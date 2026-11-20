import { afterEach, describe, expect, test } from 'bun:test';
import { useTempDir } from 'dmg-core/testing';
import { Browser } from './browser';
import type { BrowserPage } from './browser-page';
import { ExampleWebFixture } from './example-web.fixture';

// Фокус и клавиша поля основной формы в настоящем Chrome (D-UI-115): экран
// открылся — курсор в поле «Название задачи»; задача создана — курсор снова
// там; «/» вне поля ввода переводит к полю и не вводится в него. Ожидание —
// `waitFor` и `waitUntil`, таймеров нет. Запускается только `bun run browser`.

const SECONDS = 30_000;
const tmp = useTempDir('example-web-focus-browser-');
const stops: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(stops.splice(0).map((stop) => stop()));
});

const TITLE = '.region-main input[name="title"]';
const HELP = '.region-main button[data-focus-key="help"]';

/** Фокус — на элементе по селектору. */
const focused = (selector: string) =>
  `document.activeElement?.matches(${JSON.stringify(selector)}) === true`;

/** Анна вошла, список «Мои задачи» загружен. */
const started = async (): Promise<BrowserPage> => {
  const fixture = await ExampleWebFixture.start(tmp().path);
  stops.push(() => fixture.stop());
  const browser = await Browser.launch();
  stops.push(() => browser.close());
  const page = await browser.newPage();
  await fixture.enterAs(page, 'anna');
  await page.waitFor(TITLE);
  return page;
};

describe('поле основной формы на странице', () => {
  test(
    'экран «Мои задачи» открылся — фокус в поле «Название задачи»',
    async () => {
      const page = await started();

      await page.waitUntil(focused(TITLE));
    },
    SECONDS,
  );

  test(
    'задача создана кнопкой — фокус снова в поле «Название задачи»',
    async () => {
      const page = await started();

      await page.clickText('Создать задачу', '.region-main');
      await page.waitUntil(
        `document.querySelectorAll('.region-main .rows li').length === 1`,
      );

      await page.waitUntil(focused(TITLE));
    },
    SECONDS,
  );

  test(
    'у поля — aria-keyshortcuts «/»',
    async () => {
      const page = await started();

      expect(
        await page.evaluate<string | null>(
          `document.querySelector(${JSON.stringify(TITLE)}).getAttribute('aria-keyshortcuts')`,
        ),
      ).toBe('/');
    },
    SECONDS,
  );

  test(
    '«/» на кнопке «Справка» — фокус в поле, «/» в поле не введён',
    async () => {
      const page = await started();
      const before = await page.evaluate<string>(
        `document.querySelector(${JSON.stringify(TITLE)}).value`,
      );
      await page.tabTo(HELP);

      await page.press('Slash');

      await page.waitUntil(focused(TITLE));
      expect(
        await page.evaluate<string>(
          `document.querySelector(${JSON.stringify(TITLE)}).value`,
        ),
      ).toBe(before);
    },
    SECONDS,
  );

  test(
    '«/» в поле — вводится как символ',
    async () => {
      const page = await started();
      await page.waitUntil(focused(TITLE));
      await page.evaluate(
        `document.querySelector(${JSON.stringify(TITLE)}).value = ''`,
      );

      await page.press('Slash');

      expect(
        await page.evaluate<string>(
          `document.querySelector(${JSON.stringify(TITLE)}).value`,
        ),
      ).toBe('/');
    },
    SECONDS,
  );
});
