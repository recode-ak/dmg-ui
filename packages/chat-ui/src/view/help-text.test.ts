import { describe, expect, test } from 'bun:test';
import type { HelpSheet } from 'dmg-ui';
import { HELP_TEXTS } from '../conversation/conversation.const';
import { HelpText } from './help-text';

// Текст справки беседы по листу `HelpSheet`: обычный текст без стилей, один
// вид на беседу и мессенджер. Разделы — «Что можно сделать» (items) и «Куда
// можно пойти» (leads); пустое опускается. Общая справка (без живого экрана)
// без корней — «Справки пока нет.».

const sheet = (over: Partial<HelpSheet> = {}): HelpSheet => ({
  title: 'Меню',
  items: [],
  leads: [],
  ...over,
});

describe('HelpText.of: формат', () => {
  test('полный лист: заголовок, подсказка, два раздела — точный текст', () => {
    const text = HelpText.of(
      sheet({
        hint: 'Отсюда начинается работа',
        items: [
          { name: 'a', label: 'Открыть', hint: 'Откроет карточку' },
          { name: 'b', label: 'Создать' },
        ],
        leads: [
          { name: 'c', label: 'Мои задачи' },
          { name: 'd', label: 'Поручения', hint: 'Смотрите, что поручили' },
        ],
      }),
    );

    expect(text).toBe(
      [
        'Справка: Меню',
        'Отсюда начинается работа',
        '',
        'Что можно сделать:',
        '• Открыть — Откроет карточку',
        '• Создать',
        '',
        'Куда можно пойти:',
        '• Мои задачи',
        '• Поручения — Смотрите, что поручили',
      ].join('\n'),
    );
  });

  test('недоступное — пометка с причиной в конце строки; с подсказкой и без неё', () => {
    const text = HelpText.of(
      sheet({
        items: [
          {
            name: 'a',
            label: 'Создать',
            hint: 'Новая задача',
            disabled: 'Слишком много открытых задач',
          },
          { name: 'b', label: 'Дальше', disabled: 'Дальше задач нет' },
          { name: 'c', label: 'Закрыть' },
        ],
      }),
    );

    expect(text).toBe(
      [
        'Справка: Меню',
        '',
        'Что можно сделать:',
        '• Создать — Новая задача (недоступно: Слишком много открытых задач)',
        '• Дальше (недоступно: Дальше задач нет)',
        '• Закрыть',
      ].join('\n'),
    );
  });

  test('строка без подсказки — «• подпись» без тире', () => {
    const text = HelpText.of(
      sheet({ leads: [{ name: 'a', label: 'Мои задачи' }] }),
    );

    expect(text).toContain('• Мои задачи');
    expect(text).not.toContain('•  ');
    expect(text).not.toContain('Мои задачи —');
  });

  test('подсказки у листа нет — строки подсказки нет: после заголовка пустая строка и раздел', () => {
    const text = HelpText.of(
      sheet({ items: [{ name: 'a', label: 'Открыть' }] }),
    );

    expect(text).toBe(
      ['Справка: Меню', '', 'Что можно сделать:', '• Открыть'].join('\n'),
    );
  });

  test('пустой раздел опущен: только leads — без «Что можно сделать»', () => {
    const text = HelpText.of(
      sheet({ leads: [{ name: 'a', label: 'Мои задачи' }] }),
    );

    expect(text).toBe(
      ['Справка: Меню', '', 'Куда можно пойти:', '• Мои задачи'].join('\n'),
    );
    expect(text).not.toContain('Что можно сделать');
  });

  test('пустой раздел опущен: только items — без «Куда можно пойти»', () => {
    const text = HelpText.of(
      sheet({ items: [{ name: 'a', label: 'Открыть' }] }),
    );

    expect(text).not.toContain('Куда можно пойти');
  });

  test('ни подсказки, ни разделов — одна строка «Справка: <заголовок>»', () => {
    expect(HelpText.of(sheet())).toBe('Справка: Меню');
  });

  test('только подсказка — две строки, без пустых строк и разделов', () => {
    expect(HelpText.of(sheet({ hint: 'Отсюда начинается работа' }))).toBe(
      'Справка: Меню\nОтсюда начинается работа',
    );
  });

  test('текст — обычный, без стилей: нет разметки', () => {
    const text = HelpText.of(
      sheet({
        hint: 'Подсказка',
        items: [{ name: 'a', label: 'Открыть', hint: 'Подсказка' }],
        leads: [{ name: 'b', label: 'Мои задачи' }],
      }),
    );

    expect(text).not.toMatch(/[*_`<>]/);
  });

  test('чистая функция: тот же лист — тот же текст, лист не меняется', () => {
    const input = sheet({
      hint: 'Подсказка',
      items: [{ name: 'a', label: 'Открыть', disabled: 'Нельзя' }],
    });
    const before = structuredClone(input);

    expect(HelpText.of(input)).toBe(HelpText.of(input));
    expect(input).toEqual(before);
  });

  test('в тексте только слова листа: поля, которых нет в листе, в текст не идут', () => {
    const input = {
      ...sheet({ items: [{ name: 'a', label: 'Открыть' }] }),
      description: 'ОПИСАНИЕ_ЭКРАНА',
      goal: 'ЦЕЛЬ',
    };

    const text = HelpText.of(input);

    expect(text).not.toContain('ОПИСАНИЕ_ЭКРАНА');
    expect(text).not.toContain('ЦЕЛЬ');
  });

  test('имя действия (name) в текст не идёт, только подпись', () => {
    const text = HelpText.of(
      sheet({ items: [{ name: 'completeSelected', label: 'Выполнить' }] }),
    );

    expect(text).not.toContain('completeSelected');
  });
});

describe('HelpText.general: справка без живого экрана', () => {
  test('есть корни — тот же формат: заголовок приложения и «Куда можно пойти»', () => {
    const text = HelpText.general(
      sheet({
        title: 'Учебное приложение',
        leads: [
          {
            name: 'a',
            label: 'Начать работу',
            hint: 'Выберите, с чего начать',
          },
        ],
      }),
    );

    expect(text).toBe(
      [
        'Справка: Учебное приложение',
        '',
        'Куда можно пойти:',
        '• Начать работу — Выберите, с чего начать',
      ].join('\n'),
    );
  });

  test('корней нет — «Справки пока нет.»', () => {
    const text = HelpText.general(sheet({ title: 'Учебное приложение' }));

    expect(text).toBe(HELP_TEXTS.nothing);
    expect(HELP_TEXTS.nothing).toBe('Справки пока нет.');
  });
});
