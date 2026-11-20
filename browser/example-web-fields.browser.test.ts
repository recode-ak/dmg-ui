import { afterEach, describe, expect, test } from 'bun:test';
import { useTempDir } from 'dmg-core/testing';
import { Browser } from './browser';
import type { BrowserPage } from './browser-page';
import { ExampleWebFixture } from './example-web.fixture';

// Вид поля на странице в настоящем Chrome: виджет решает вид поля (число,
// дата, чекбокс, строка), подсказка, пример и пределы — видимым текстом,
// связанным с полем через `aria-describedby` (дерево доступности). Числовой
// ввод не перехватывает проверку браузера: замечание — текст схемы ядра.
// Ожидание — `waitFor` и `waitUntil`, таймеров нет. Запускается только
// `bun run browser`.

const SECONDS = 30_000;
const tmp = useTempDir('example-web-fields-browser-');
const stops: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(stops.splice(0).map((stop) => stop()));
});

const DATE_ISSUE = 'Дата в виде ГГГГ-ММ-ДД';
const PART = '.region-main input[name="part"]';
const TITLE = '.region-main input[name="title"]';
const URGENT = '.region-side input[name="urgent"]';
const REMIND_ON = '.region-side input[name="remindOn"]';
const CREATE_SUBMIT = '.region-main button[data-focus-key="submit:create"]';
const COMPLETE_ALL =
  '.region-main button[data-focus-key="action:completeSelected"]';

/** Условие «в области `region` страницы есть текст `text`». */
const regionHas = (region: string, text: string) =>
  `document.querySelector('.region-${region}')?.innerText.includes(${JSON.stringify(text)}) === true`;

/** Значение атрибута первого элемента по селектору: `null`, если атрибута нет. */
const attr = (page: BrowserPage, selector: string, name: string) =>
  page.evaluate<string | null>(
    `document.querySelector(${JSON.stringify(selector)}).getAttribute(${JSON.stringify(name)})`,
  );

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

/** Анна создала задачу кнопкой «Создать задачу». */
const withTask = async (page: BrowserPage) => {
  await page.clickText('Создать задачу', '.region-main');
  await page.waitFor('.region-main .rows li');
};

/** Задача создана и открыта: карточка в соседней области. */
const onCard = async (): Promise<BrowserPage> => {
  const page = await started();
  await withTask(page);
  await page.clickText('Открыть', '.region-main');
  await page.waitFor('.region-side .card-head');
  return page;
};

/** Ставит дату в поле и сообщает странице событием `input`, как ввод человека. */
const typeDate = (page: BrowserPage, value: string) =>
  page.evaluate(`(() => {
    const field = document.querySelector(${JSON.stringify(REMIND_ON)});
    field.value = ${JSON.stringify(value)};
    field.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);

describe('число и строка в форме списка', () => {
  test(
    'jumpTo.part: type=number, min=1, max=99, step=1 из пределов схемы',
    async () => {
      const page = await started();

      expect({
        type: await attr(page, PART, 'type'),
        min: await attr(page, PART, 'min'),
        max: await attr(page, PART, 'max'),
        step: await attr(page, PART, 'step'),
      }).toEqual({ type: 'number', min: '1', max: '99', step: '1' });
    },
    SECONDS,
  );

  test(
    'jumpTo.part: имя «Часть», описание — подсказка, пример и пределы одной строкой',
    async () => {
      const page = await started();

      const node = await page.accessibility(PART);

      expect(node.name).toBe('Часть');
      expect(node.description).toBe(
        'Номер части списка, с первой; Пример: 2; Пределы: от 1 до 99, целое',
      );
    },
    SECONDS,
  );

  test(
    'форма с числом: novalidate — проверку выхода за предел делает схема, а не пузырь браузера',
    async () => {
      const page = await started();

      expect(
        await page.evaluate<boolean>(
          `document.querySelector(${JSON.stringify(PART)}).form.noValidate`,
        ),
      ).toBe(true);
    },
    SECONDS,
  );

  test(
    'create.title: type=text, описание — подсказка, пример и пределы',
    async () => {
      const page = await started();

      const node = await page.accessibility(TITLE);

      expect(await attr(page, TITLE, 'type')).toBe('text');
      expect(node.name).toBe('Название задачи');
      expect(node.description).toBe(
        'Коротко: что нужно сделать; Пример: Купить хлеб; Пределы: не пустое',
      );
    },
    SECONDS,
  );
});

describe('карточка: «Напомнить» — булево и дата', () => {
  test(
    'urgent — чекбокс с именем «Срочно» и подсказкой; примера у чекбокса нет',
    async () => {
      const page = await onCard();

      const node = await page.accessibility(URGENT);

      expect(await attr(page, URGENT, 'type')).toBe('checkbox');
      expect(node.name).toBe('Срочно');
      expect(node.description).toBe('Срочное напоминание придёт сразу');
    },
    SECONDS,
  );

  test(
    'remindOn — поле даты с именем «Когда», описание «День напоминания; Пример: 2026-12-31»',
    async () => {
      const page = await onCard();

      const node = await page.accessibility(REMIND_ON);

      expect(await attr(page, REMIND_ON, 'type')).toBe('date');
      expect(node.name).toBe('Когда');
      expect(node.description).toBe('День напоминания; Пример: 2026-12-31');
    },
    SECONDS,
  );

  test(
    'галочка без даты: замечание «Дата в виде ГГГГ-ММ-ДД» схемы, галочка осталась',
    async () => {
      const page = await onCard();
      await page.click(URGENT);

      await page.clickText('Напомнить', '.region-side');
      await page.waitUntil(regionHas('side', DATE_ISSUE));

      expect(
        await page.evaluate<boolean>(
          `document.querySelector(${JSON.stringify(URGENT)}).checked`,
        ),
      ).toBe(true);
    },
    SECONDS,
  );

  test(
    'верная дата: отправка без замечания, форма сброшена — галочки и даты нет',
    async () => {
      const page = await onCard();
      await page.click(URGENT);
      await typeDate(page, '2026-12-31');

      await page.clickText('Напомнить', '.region-side');

      await page.waitUntil(`(() => {
        const side = document.querySelector('.region-side');
        return side.querySelector('input[name="remindOn"]').value === ''
          && !side.querySelector('input[name="urgent"]').checked;
      })()`);
      expect(
        await page.evaluate<boolean>(
          `!document.querySelector('.region-side').innerText.includes(${JSON.stringify(DATE_ISSUE)})`,
        ),
      ).toBe(true);
    },
    SECONDS,
  );
});

describe('«Назначенные мне»: выбор и выполнение своего поручения', () => {
  /** Анна создала задачу, открыла карточку и назначила её себе; затем открыла «Назначенные мне». */
  const assignedToSelf = async (): Promise<BrowserPage> => {
    const page = await onCard();
    await page.evaluate(`(() => {
      const select = document.querySelector('.region-side select[name="assigneeId"]');
      select.value = [...select.options].find((option) => option.text === 'Анна').value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await page.clickText('Назначить', '.region-side');
    // Успешное назначение сбрасывает форму: выбор вернулся к пустому, а область
    // снова не ждёт ответа (приглушённая область держит прежнее тело).
    await page.waitUntil(
      `document.querySelector('.region-side select[name="assigneeId"]').value === ''
        && document.querySelector('.region-side').getAttribute('aria-busy') === 'false'`,
    );
    await page.click('a[href="/assigned"]');
    // Заголовок нового экрана виден уже при загрузке над прежним, приглушённым
    // списком: однозначный признак готовности — область не приглушена и в ней
    // доступная галочка нового экрана.
    await page.waitUntil(
      `${regionHas('main', 'Назначенные мне')}
        && document.querySelector('.region-main').getAttribute('aria-busy') === 'false'
        && document.querySelector('.region-main .rows input[type="checkbox"]:not(:disabled)') !== null`,
    );
    return page;
  };

  test(
    'до галочки «Выполнить выбранные» серая с причиной, после — доступна; «Подтвердить» — строка «выполнена»',
    async () => {
      const page = await assignedToSelf();

      expect(await attr(page, COMPLETE_ALL, 'aria-disabled')).toBe('true');
      expect(await attr(page, COMPLETE_ALL, 'title')).toBe(
        'Отметьте открытые задачи',
      );

      await page.click('.region-main .rows input[type="checkbox"]');
      await page.waitUntil(
        `!document.querySelector(${JSON.stringify(COMPLETE_ALL)}).hasAttribute('aria-disabled')`,
      );
      await page.clickText('Выполнить выбранные', '.region-main');
      await page.waitFor('.region-main .confirm');
      await page.clickText('Подтвердить', '.region-main');

      await page.waitUntil(
        `document.querySelector('.region-main .rows').innerText.includes('выполнена')`,
      );
    },
    SECONDS,
  );
});
