import { afterEach, describe, expect, test } from 'bun:test';
import { useTempDir } from 'dmg-core/testing';
import { Browser } from './browser';
import type { BrowserPage } from './browser-page';
import { ExampleWebFixture } from './example-web.fixture';

// Отключённое действие на странице в настоящем Chrome: причина видимым
// текстом, `aria-disabled` вместо нативного `disabled`, доступность с
// клавиатуры и скринридеру (дерево доступности), нажатие ничего не отправляет.
// Ожидание — `waitFor` и `waitUntil`, таймеров нет. Наведение проверить нечем:
// проверяется атрибут `title`. Запускается только `bun run browser`.

const SECONDS = 30_000;
const tmp = useTempDir('example-web-disabled-browser-');
const stops: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(stops.splice(0).map((stop) => stop()));
});

const COMPLETE_ALL =
  '.region-main button[data-focus-key="action:completeSelected"]';
const CREATE_SUBMIT = '.region-main button[data-focus-key="submit:create"]';
const SELECT_REASON = 'Отметьте открытые задачи';
const LIMIT_REASON = 'Слишком много открытых задач';

/** Значение атрибута первого элемента по селектору: `null`, если атрибута нет. */
const attr = (page: BrowserPage, selector: string, name: string) =>
  page.evaluate<string | null>(
    `document.querySelector(${JSON.stringify(selector)}).getAttribute(${JSON.stringify(name)})`,
  );

/** Подсчёт отправок по WebSocket страницы: оборачивает `send` до нажатий. */
const COUNT_SENDS = `(() => {
  window.__sends = 0;
  const send = WebSocket.prototype.send;
  WebSocket.prototype.send = function (...args) {
    window.__sends += 1;
    return send.apply(this, args);
  };
})()`;

const sends = (page: BrowserPage) => page.evaluate<number>('window.__sends');

/** Анна вошла, список «Мои задачи» загружен: форма «Создать задачу» на странице. */
const started = async (): Promise<BrowserPage> => {
  const fixture = await ExampleWebFixture.start(tmp().path);
  stops.push(() => fixture.stop());
  const browser = await Browser.launch();
  stops.push(() => browser.close());
  const page = await browser.newPage();
  await fixture.enterAs(page, 'anna');
  await page.waitFor(CREATE_SUBMIT);
  return page;
};

/** Создаёт `count` открытых задач кнопкой «Создать задачу»; видимых строк не больше двух (страница списка). */
const createTasks = async (page: BrowserPage, count: number) => {
  for (let made = 1; made <= count; made += 1) {
    await page.clickText('Создать задачу', '.region-main');
    if (made <= 2) {
      await page.waitUntil(
        `document.querySelectorAll('.region-main .rows li').length === ${made}`,
      );
    }
  }
};

describe('кнопка действия с причиной на странице', () => {
  test(
    'пустой список: «Выполнить выбранные» — aria-disabled, без disabled, title — причина, видимый текст по aria-describedby — причина',
    async () => {
      const page = await started();

      expect(await attr(page, COMPLETE_ALL, 'aria-disabled')).toBe('true');
      expect(await attr(page, COMPLETE_ALL, 'disabled')).toBeNull();
      expect(await attr(page, COMPLETE_ALL, 'title')).toBe(SELECT_REASON);
      const reason = await page.evaluate<{
        visible: boolean;
        text: string;
      }>(`(() => {
        const button = document.querySelector(${JSON.stringify(COMPLETE_ALL)});
        const shown = document.getElementById(button.getAttribute('aria-describedby'));
        return { visible: shown.getClientRects().length > 0, text: shown.innerText };
      })()`);
      expect(reason).toEqual({ visible: true, text: SELECT_REASON });
    },
    SECONDS,
  );

  test(
    'дерево доступности: роль button, имя «Выполнить выбранные», описание — причина, disabled и focusable',
    async () => {
      const page = await started();

      const node = await page.accessibility(COMPLETE_ALL);

      expect(node).toEqual({
        role: 'button',
        name: 'Выполнить выбранные',
        description: SELECT_REASON,
        disabled: true,
        focusable: true,
      });
    },
    SECONDS,
  );

  test(
    'Enter и пробел на кнопке с причиной: ничего не отправлено, подтверждения нет',
    async () => {
      const page = await started();
      await page.evaluate(COUNT_SENDS);
      // Нативный disabled Tab пропускает: не дошёл — `tabTo` бросит.
      await page.tabTo(COMPLETE_ALL);
      const before = await sends(page);

      await page.press('Enter');
      await page.press('Space');

      expect(await sends(page)).toBe(before);
      expect(
        await page.evaluate<boolean>(
          `document.querySelector('.region-main .confirm') === null`,
        ),
      ).toBe(true);
    },
    SECONDS,
  );

  test(
    'каждая кнопка с aria-disabled в основной области имеет непустое описание',
    async () => {
      const page = await started();
      const keys = await page.evaluate<string[]>(
        `[...document.querySelectorAll('.region-main button[aria-disabled="true"]')].map((button) => button.dataset.focusKey)`,
      );

      const descriptions: { key: string; description: string }[] = [];
      for (const key of keys) {
        const node = await page.accessibility(
          `.region-main button[data-focus-key="${key}"]`,
        );
        descriptions.push({ key, description: node.description });
      }

      expect(keys).toEqual(
        expect.arrayContaining([
          'action:completeSelected',
          'action:next',
          'action:prev',
        ]),
      );
      for (const item of descriptions) {
        expect(item.description).not.toBe('');
      }
    },
    SECONDS,
  );

  test(
    'после отметки строки «Выполнить выбранные» без aria-disabled, title и aria-describedby, причина исчезла, Tab достигает',
    async () => {
      const page = await started();
      await createTasks(page, 1);
      const reasonId = await attr(page, COMPLETE_ALL, 'aria-describedby');

      await page.click('.region-main .rows input[type="checkbox"]');
      await page.waitUntil(
        `!document.querySelector(${JSON.stringify(COMPLETE_ALL)}).hasAttribute('aria-disabled')`,
      );

      expect(reasonId).not.toBeNull();
      expect(await attr(page, COMPLETE_ALL, 'title')).toBeNull();
      expect(await attr(page, COMPLETE_ALL, 'aria-describedby')).toBeNull();
      expect(
        await page.evaluate<boolean>(
          `document.getElementById(${JSON.stringify(reasonId)}) === null`,
        ),
      ).toBe(true);
      expect((await page.accessibility(COMPLETE_ALL)).disabled).toBe(false);
      await page.tabTo(COMPLETE_ALL);
    },
    SECONDS,
  );
});

describe('форма при пределе открытых задач на странице', () => {
  /** Три открытые задачи: форма «Создать задачу» отключена пределом. */
  const limited = async (): Promise<BrowserPage> => {
    const page = await started();
    await createTasks(page, 3);
    await page.waitUntil(
      `document.querySelector(${JSON.stringify(CREATE_SUBMIT)}).getAttribute('aria-disabled') === 'true'`,
    );
    return page;
  };

  test(
    'кнопка отправки: описание — причина «Слишком много открытых задач»; поле названия нативно disabled',
    async () => {
      const page = await limited();

      const node = await page.accessibility(CREATE_SUBMIT);

      expect(node).toMatchObject({
        role: 'button',
        name: 'Создать задачу',
        description: LIMIT_REASON,
        disabled: true,
        focusable: true,
      });
      expect(await attr(page, CREATE_SUBMIT, 'disabled')).toBeNull();
      expect(
        await page.evaluate<boolean>(
          `document.querySelector('.region-main input[name="title"]').disabled`,
        ),
      ).toBe(true);
    },
    SECONDS,
  );

  test(
    'Tab доходит до кнопки отправки, Enter — отправок нет, форма не ушла',
    async () => {
      const page = await limited();
      await page.evaluate(COUNT_SENDS);
      await page.tabTo(CREATE_SUBMIT);
      const before = await sends(page);

      await page.press('Enter');

      expect(await sends(page)).toBe(before);
    },
    SECONDS,
  );
});
