import { afterEach, describe, expect, test } from 'bun:test';
import { useTempDir } from 'dmg-core/testing';
import { Browser } from './browser';
import { ExampleWebFixture } from './example-web-fixture';

// Дымовой сценарий: сервер примера на порту 0 и настоящий Chrome. Вход как
// человек — через страницу «Кто вы?»; после него в DOM — приложение примера.
// Запускается только `bun run browser`.

const SECONDS = 30_000;
const tmp = useTempDir('example-web-browser-');
const stops: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(stops.splice(0).map((stop) => stop()));
});

describe('пример web-канала в Chrome', () => {
  test(
    'страница выбора: «Кто вы?» и кнопка «Анна»',
    async () => {
      const fixture = await ExampleWebFixture.start(tmp().path);
      stops.push(() => fixture.stop());
      const browser = await Browser.launch();
      stops.push(() => browser.close());
      const page = await browser.newPage();

      await page.goto(fixture.origin);

      expect(await page.text('body')).toContain('Кто вы?');
      expect(await page.text('body')).toContain('Анна');
    },
    SECONDS,
  );

  test(
    'вход как Анна: в DOM корневой элемент приложения, «Кто вы?» ушло',
    async () => {
      const fixture = await ExampleWebFixture.start(tmp().path);
      stops.push(() => fixture.stop());
      const browser = await Browser.launch();
      stops.push(() => browser.close());
      const page = await browser.newPage();

      await fixture.enterAs(page, 'anna');

      await page.waitFor('main.example-app');
      expect(await page.text('body')).not.toContain('Кто вы?');
    },
    SECONDS,
  );

  test(
    'waitFor несуществующего селектора — ошибка называет селектор',
    async () => {
      const fixture = await ExampleWebFixture.start(tmp().path);
      stops.push(() => fixture.stop());
      const browser = await Browser.launch();
      stops.push(() => browser.close());
      const page = await browser.newPage();
      await page.goto(fixture.origin);

      await expect(page.waitFor('#нет-такого-элемента', 300)).rejects.toThrow(
        '#нет-такого-элемента',
      );
    },
    SECONDS,
  );
});
