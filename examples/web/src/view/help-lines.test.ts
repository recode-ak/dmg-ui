import { describe, expect, test } from 'bun:test';
import type { HelpSheet } from 'dmg-ui';
import { HelpLines } from './help-lines';
import { HELP_TEXTS } from './view-texts.const';

// Модель справки области по листу `HelpSheet`: заголовок, подсказка и разделы
// строк; подписи разделов и слово «недоступно» — из `HELP_TEXTS`. Чистая
// функция, без DOM; в строках только слова листа.

const sheet = (over: Partial<HelpSheet> = {}): HelpSheet => ({
  title: 'Мои задачи',
  items: [],
  leads: [],
  ...over,
});

describe('HelpLines: разделы и строки', () => {
  test('полный лист: заголовок, подсказка и два раздела по порядку — действия, затем переходы', () => {
    const model = HelpLines.of(
      sheet({
        hint: 'Отметьте задачи и выполните их разом',
        items: [
          { name: 'a', label: 'Открыть задачу', hint: 'Карточка выбранной' },
          { name: 'b', label: 'Создать задачу' },
        ],
        leads: [
          { name: 'c', label: 'Назначенные мне', hint: 'Смотрите поручения' },
          { name: 'd', label: 'Мои задачи' },
        ],
      }),
      true,
    );

    expect(model).toStrictEqual({
      open: true,
      title: 'Мои задачи',
      hint: 'Отметьте задачи и выполните их разом',
      sections: [
        {
          heading: HELP_TEXTS.items,
          lines: ['Открыть задачу — Карточка выбранной', 'Создать задачу'],
        },
        {
          heading: HELP_TEXTS.leads,
          lines: ['Назначенные мне — Смотрите поручения', 'Мои задачи'],
        },
      ],
    });
  });

  test('недоступное — причина из листа в скобках после слова из HELP_TEXTS; с подсказкой и без неё', () => {
    const { sections } = HelpLines.of(
      sheet({
        items: [
          {
            name: 'a',
            label: 'Создать задачу',
            hint: 'Новая задача',
            disabled: 'Слишком много открытых задач',
          },
          { name: 'b', label: 'Дальше', disabled: 'Дальше задач нет' },
        ],
      }),
      false,
    );

    expect(sections[0]?.lines).toEqual([
      `Создать задачу — Новая задача (${HELP_TEXTS.unavailable}: Слишком много открытых задач)`,
      `Дальше (${HELP_TEXTS.unavailable}: Дальше задач нет)`,
    ]);
  });

  test('пустой раздел опущен: только переходы — один раздел; только действия — один раздел', () => {
    const leads = HelpLines.of(
      sheet({ leads: [{ name: 'a', label: 'Мои задачи' }] }),
      false,
    );
    const items = HelpLines.of(
      sheet({ items: [{ name: 'a', label: 'Открыть' }] }),
      false,
    );

    expect(leads.sections.map((section) => section.heading)).toEqual([
      HELP_TEXTS.leads,
    ]);
    expect(items.sections.map((section) => section.heading)).toEqual([
      HELP_TEXTS.items,
    ]);
  });

  test('ни действий, ни переходов — разделов нет; ключа hint нет, если подсказки в листе нет', () => {
    expect(HelpLines.of(sheet(), false)).toStrictEqual({
      open: false,
      title: 'Мои задачи',
      sections: [],
    });
  });

  test('open — как передан: открыта и закрыта', () => {
    expect(HelpLines.of(sheet(), true).open).toBe(true);
    expect(HelpLines.of(sheet(), false).open).toBe(false);
  });
});

describe('HelpLines: текст только из листа', () => {
  test('поля, которых нет в листе (описание, цель), и имена действий в модель не идут', () => {
    const input = {
      ...sheet({
        hint: 'Подсказка',
        items: [{ name: 'completeSelected', label: 'Выполнить выбранные' }],
        leads: [{ name: 'followAssigned', label: 'Поручения' }],
      }),
      description: 'ОПИСАНИЕ_ЭКРАНА',
      goal: 'ЦЕЛЬ',
    };

    const text = JSON.stringify(HelpLines.of(input, true));

    expect(text).not.toContain('ОПИСАНИЕ_ЭКРАНА');
    expect(text).not.toContain('ЦЕЛЬ');
    expect(text).not.toContain('completeSelected');
    expect(text).not.toContain('followAssigned');
  });

  test('модель — данные JSON; лист не меняется', () => {
    const input = sheet({
      hint: 'Подсказка',
      items: [{ name: 'a', label: 'Открыть', disabled: 'Нельзя' }],
      leads: [{ name: 'b', label: 'Мои задачи' }],
    });
    const before = structuredClone(input);

    const model = HelpLines.of(input, true);

    expect(JSON.parse(JSON.stringify(model))).toEqual(model);
    expect(input).toEqual(before);
  });
});
