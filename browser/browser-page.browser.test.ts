import { afterEach, describe, expect, test } from 'bun:test';
import { Browser } from './browser';
import type { BrowserPage } from './browser-page';

// Клиент `BrowserPage` на странице-заготовке из `data:` (примера нет):
// клавиатура и дерево доступности. Нативный `disabled` Tab пропускает,
// `aria-disabled` — нет (замер Chrome 150). Запускается только `bun run browser`.

const SECONDS = 30_000;
const stops: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(stops.splice(0).map((stop) => stop()));
});

describe('клиент browser/: клавиатура и дерево доступности на странице-заготовке', () => {
  const FIXTURE = [
    '<button id="a">Первая</button>',
    '<button id="off" disabled>Нативно выключена</button>',
    '<button id="soft" aria-disabled="true" aria-describedby="why">Мягко выключена</button>',
    '<p id="why">Причина</p>',
    '<button id="last">Последняя</button>',
  ].join('');

  const opened = async (): Promise<BrowserPage> => {
    const browser = await Browser.launch();
    stops.push(() => browser.close());
    const page = await browser.newPage();
    await page.goto(
      `data:text/html;charset=utf-8,${encodeURIComponent(FIXTURE)}`,
    );
    return page;
  };

  const activeId = (page: BrowserPage) =>
    page.evaluate<string>('document.activeElement.id');

  test(
    'press(Tab): фокус идёт по порядку и пропускает нативный disabled, но не aria-disabled',
    async () => {
      const page = await opened();

      await page.press('Tab');
      const first = await activeId(page);
      await page.press('Tab');
      const second = await activeId(page);

      expect([first, second]).toEqual(['a', 'soft']);
    },
    SECONDS,
  );

  test(
    'tabTo: доходит до элемента по селектору',
    async () => {
      const page = await opened();

      await page.tabTo('#last');

      expect(await activeId(page)).toBe('last');
    },
    SECONDS,
  );

  test(
    'tabTo: не дошёл за max нажатий — бросок с селектором и числом нажатий',
    async () => {
      const page = await opened();

      const failure = page.tabTo('#нет-такого', 3);

      await expect(failure).rejects.toThrow('#нет-такого');
      await expect(failure).rejects.toThrow('3');
    },
    SECONDS,
  );

  test(
    'press(Enter): на сфокусированной кнопке вызывает click',
    async () => {
      const page = await opened();
      await page.evaluate(
        `document.getElementById('last').addEventListener('click', () => { window.clicked = true; })`,
      );
      await page.tabTo('#last');

      await page.press('Enter');

      expect(await page.evaluate<boolean>('window.clicked === true')).toBe(
        true,
      );
    },
    SECONDS,
  );

  test(
    'accessibility: роль, имя, описание из aria-describedby, disabled и focusable; у обычной кнопки disabled false',
    async () => {
      const page = await opened();

      expect(await page.accessibility('#soft')).toEqual({
        role: 'button',
        name: 'Мягко выключена',
        description: 'Причина',
        disabled: true,
        focusable: true,
      });
      expect(await page.accessibility('#a')).toMatchObject({
        role: 'button',
        name: 'Первая',
        description: '',
        disabled: false,
        focusable: true,
      });
    },
    SECONDS,
  );

  test(
    'accessibility: нет элемента — бросок с селектором',
    async () => {
      const page = await opened();

      await expect(page.accessibility('#нет-такого')).rejects.toThrow(
        '#нет-такого',
      );
    },
    SECONDS,
  );
});
