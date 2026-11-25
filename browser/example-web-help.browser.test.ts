import { afterEach, describe, expect, test } from 'bun:test';
import { useTempDir } from 'dmg-core/testing';
import {
  FollowAssignedStoryDef,
  MainMenuScreenDef,
  TaskListScreenDef,
} from 'dmg-ui/example';
import { Browser } from './browser';
import type { BrowserPage } from './browser-page';
import { ExampleWebFixture } from './example-web.fixture';

// Справка области в настоящем Chrome: кнопка «Справка» у заголовка области
// достижима с клавиатуры, в дереве доступности — кнопка с именем и признаком
// раскрытия; Enter открывает блок со справкой (подсказка экрана, подсказка
// двери в меню, причина отключённого), повторный Enter закрывает; фокус
// остаётся на кнопке. Ожидание — `waitFor` и `waitUntil`, таймеров нет.
// Запускается только `bun run browser`.

const SECONDS = 30_000;
const tmp = useTempDir('example-web-help-browser-');
const stops: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(stops.splice(0).map((stop) => stop()));
});

const HELP_BUTTON = '.region-main button[data-focus-key="help"]';
const HELP_BLOCK = '.region-main section.help';
const SELECT_REASON = 'Отметьте открытые задачи';

/** Условие «в основной области страницы есть текст `text`». */
const mainHas = (text: string) =>
  `document.querySelector('.region-main')?.innerText.includes(${JSON.stringify(text)}) === true`;

/** Значение атрибута первого элемента по селектору: `null`, если атрибута нет. */
const attr = (page: BrowserPage, selector: string, name: string) =>
  page.evaluate<string | null>(
    `document.querySelector(${JSON.stringify(selector)}).getAttribute(${JSON.stringify(name)})`,
  );

const expanded = (value: 'true' | 'false') =>
  `document.querySelector(${JSON.stringify(HELP_BUTTON)})?.getAttribute('aria-expanded') === '${value}'`;

const focusOnButton = (page: BrowserPage) =>
  page.evaluate<boolean>(
    `document.activeElement?.matches(${JSON.stringify(HELP_BUTTON)}) === true`,
  );

const blockAbsent = (page: BrowserPage) =>
  page.evaluate<boolean>(
    `document.querySelector(${JSON.stringify(HELP_BLOCK)}) === null`,
  );

/** Анна вошла, в основной области список «Мои задачи» с кнопкой справки. */
const started = async (): Promise<BrowserPage> => {
  const fixture = await ExampleWebFixture.start(tmp().path);
  stops.push(() => fixture.stop());
  const browser = await Browser.launch();
  stops.push(() => browser.close());
  const page = await browser.newPage();
  await fixture.enterAs(page, 'anna');
  await page.waitUntil(mainHas(TaskListScreenDef.label));
  await page.waitFor(HELP_BUTTON);
  return page;
};

/** Фокус на кнопке «Справка», Enter, ждём раскрытия и блока. */
const opened = async (page: BrowserPage): Promise<void> => {
  await page.tabTo(HELP_BUTTON);
  await page.press('Enter');
  await page.waitUntil(expanded('true'));
  await page.waitFor(HELP_BLOCK);
};

describe('справка области на странице в Chrome', () => {
  test(
    'кнопка «Справка» достижима с клавиатуры; в дереве доступности — button с именем «Справка»; aria-expanded="false", блока справки нет',
    async () => {
      const page = await started();

      await page.tabTo(HELP_BUTTON);

      expect(await page.accessibility(HELP_BUTTON)).toMatchObject({
        role: 'button',
        name: 'Справка',
        disabled: false,
        focusable: true,
      });
      expect(await attr(page, HELP_BUTTON, 'aria-expanded')).toBe('false');
      expect(await attr(page, HELP_BUTTON, 'aria-controls')).toBeNull();
      expect(await blockAbsent(page)).toBe(true);
    },
    SECONDS,
  );

  test(
    'Enter открывает справку (aria-expanded="true", aria-controls на блок), повторный Enter закрывает; фокус остаётся на кнопке',
    async () => {
      const page = await started();
      await opened(page);

      const blockId = await attr(page, HELP_BLOCK, 'id');
      expect(blockId).toBe('sheet-main');
      expect(await attr(page, HELP_BUTTON, 'aria-controls')).toBe(blockId);
      expect(await focusOnButton(page)).toBe(true);

      await page.press('Enter');

      await page.waitUntil(expanded('false'));
      expect(await blockAbsent(page)).toBe(true);
      expect(await attr(page, HELP_BUTTON, 'aria-controls')).toBeNull();
      expect(await focusOnButton(page)).toBe(true);
    },
    SECONDS,
  );

  test(
    'в справке — подсказка экрана и причина отключённого действия, описаний Def нет',
    async () => {
      const page = await started();
      await opened(page);

      const text = await page.text(HELP_BLOCK);

      expect(text).toContain(TaskListScreenDef.hint!);
      expect(text).toContain(SELECT_REASON);
      expect(text).not.toContain(TaskListScreenDef.description);
      for (const action of Object.values(TaskListScreenDef.actions)) {
        expect(text).not.toContain(action.description);
      }
    },
    SECONDS,
  );

  test(
    'в меню справка закрыта после перехода и показывает подсказку двери «Назначенные мне»',
    async () => {
      const page = await started();
      await opened(page);

      await page.click('a[href="/menu"]');

      await page.waitUntil(mainHas(MainMenuScreenDef.label));
      await page.waitUntil(expanded('false'));
      expect(await blockAbsent(page)).toBe(true);
      await opened(page);
      const text = await page.text(HELP_BLOCK);
      expect(text).toContain(MainMenuScreenDef.hint!);
      expect(text).toContain(FollowAssignedStoryDef.hint!);
      expect(text).not.toContain(MainMenuScreenDef.description);
    },
    SECONDS,
  );
});
