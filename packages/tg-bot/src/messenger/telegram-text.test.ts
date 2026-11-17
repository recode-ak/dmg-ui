import { describe, expect, test } from 'bun:test';
import { type FormattedText, PlainText, TextBuilder } from 'dmg-ui/chat-ui';
import type { MessageEntity } from '../bot-api/bot-api.types';
import { TelegramText } from './telegram-text';

// Перевод форматированного текста в `text` и `entities` Bot API: текст —
// видимый (`PlainText`), смещения и длины — единицы UTF-16, строки — как
// есть (без разметки и экранирования). Строчные стили и ссылка — на каждый
// фрагмент отдельно, цитата — одна на непрерывную серию фрагментов: так две
// сущности либо не пересекаются, либо одна внутри другой. Строчный код в
// цитате отбрасывается; адрес ссылки — только `http`, `https`, `tg`.

/** Сущность глазами собеседника: вид и текст, который она покрывает. */
const covered = (out: {
  readonly text: string;
  readonly entities: readonly MessageEntity[];
}) =>
  out.entities
    .map((entity): { readonly type: string; readonly text: string } => ({
      type: entity.type,
      text: out.text.slice(entity.offset, entity.offset + entity.length),
    }))
    .sort(byTypeAndText);

const byTypeAndText = (
  a: { readonly type: string; readonly text: string },
  b: { readonly type: string; readonly text: string },
) => a.type.localeCompare(b.type) || a.text.localeCompare(b.text);

/** Сущности в каноническом порядке: по смещению, длинные раньше, затем по виду. */
const sorted = (entities: readonly MessageEntity[]) =>
  [...entities].sort(
    (a, b) =>
      a.offset - b.offset ||
      b.length - a.length ||
      a.type.localeCompare(b.type),
  );

/** Две сущности не пересекаются или одна целиком внутри другой. */
const nested = (a: MessageEntity, b: MessageEntity) => {
  const aEnd = a.offset + a.length;
  const bEnd = b.offset + b.length;
  const apart = aEnd <= b.offset || bEnd <= a.offset;
  const aInB = b.offset <= a.offset && aEnd <= bEnd;
  const bInA = a.offset <= b.offset && bEnd <= aEnd;
  return apart || aInB || bInA;
};

const FAMILY = '\u{1F468}‍\u{1F469}‍\u{1F467}‍\u{1F466}';
const FLAG = '\u{1F1F0}\u{1F1FF}';
const THUMB = '\u{1F44D}\u{1F3FD}';
const E_ACUTE = 'é';
const ASTRAL = '\u{1D49C}';

describe('TelegramText — текст и стили', () => {
  test('text — видимый текст: подпись ссылки остаётся, адреса нет', () => {
    const text: FormattedText = [
      { text: 'Смотри ', styles: [] },
      { text: 'урок', styles: [], link: 'https://example.com/lesson' },
      { text: '.', styles: [] },
    ];

    expect(TelegramText.of(text).text).toBe(PlainText.of(text));
    expect(TelegramText.of(text).text).toBe('Смотри урок.');
  });

  test('стили — bold, italic, strikethrough, code, pre, blockquote; ссылка — text_link с адресом', () => {
    const text: FormattedText = [
      { text: 'Ж', styles: ['bold'] },
      { text: 'К', styles: ['italic'] },
      { text: 'З', styles: ['strike'] },
      { text: 'C', styles: ['code'] },
      { text: '\n', styles: [] },
      { text: 'блок', styles: ['codeBlock'] },
      { text: '\n', styles: [] },
      { text: 'цитата', styles: ['quote'] },
      { text: '\n', styles: [] },
      { text: 'ссылка', styles: [], link: 'https://example.com' },
    ];

    expect(sorted(TelegramText.of(text).entities)).toEqual([
      { type: 'bold', offset: 0, length: 1 },
      { type: 'italic', offset: 1, length: 1 },
      { type: 'strikethrough', offset: 2, length: 1 },
      { type: 'code', offset: 3, length: 1 },
      { type: 'pre', offset: 5, length: 4 },
      { type: 'blockquote', offset: 10, length: 6 },
      {
        type: 'text_link',
        offset: 17,
        length: 6,
        url: 'https://example.com',
      },
    ]);
  });

  test('несколько стилей фрагмента — по сущности на стиль с тем же диапазоном', () => {
    const text: FormattedText = [
      { text: 'а ', styles: [] },
      { text: 'важно', styles: ['bold', 'italic', 'strike'] },
    ];

    expect(sorted(TelegramText.of(text).entities)).toEqual([
      { type: 'bold', offset: 2, length: 5 },
      { type: 'italic', offset: 2, length: 5 },
      { type: 'strikethrough', offset: 2, length: 5 },
    ]);
  });

  test('строчный стиль — на каждый фрагмент отдельно, соседние фрагменты не склеиваются', () => {
    const text: FormattedText = [
      { text: 'раз', styles: ['bold'] },
      { text: 'два', styles: ['bold'], link: 'https://example.com' },
    ];

    expect(sorted(TelegramText.of(text).entities)).toEqual([
      { type: 'bold', offset: 0, length: 3 },
      { type: 'bold', offset: 3, length: 3 },
      {
        type: 'text_link',
        offset: 3,
        length: 3,
        url: 'https://example.com',
      },
    ]);
  });

  test('текст из построителя: строка без стилей — без сущностей', () => {
    expect(TelegramText.of(TextBuilder.of('Привет'))).toEqual({
      text: 'Привет',
      entities: [],
    });
  });

  test('знаки разметки уходят как есть, без экранирования', () => {
    const marks = '*_[]()~`>#+-=|{}.!\\<&';

    expect(TelegramText.of(TextBuilder.of(marks))).toEqual({
      text: marks,
      entities: [],
    });
  });
});

describe('TelegramText — смещения в UTF-16', () => {
  test('составные символы: семья с ZWJ, флаг, тон кожи, é из двух кодовых точек, астральный символ — каждая сущность покрывает ровно текст фрагмента', () => {
    const text: FormattedText = [
      { text: `Семья ${FAMILY} и `, styles: [] },
      { text: FLAG, styles: ['bold'] },
      { text: ` рука ${THUMB} `, styles: ['italic'] },
      { text: `caf${E_ACUTE}`, styles: ['strike'] },
      { text: ' ', styles: [] },
      { text: `${ASTRAL}x`, styles: ['code'] },
      { text: ' ', styles: [] },
      {
        text: `${FAMILY} ссылка`,
        styles: ['bold'],
        link: 'https://example.com/a',
      },
      { text: '\n', styles: [] },
      { text: `цитата ${FLAG}${E_ACUTE}`, styles: ['quote'] },
      { text: '\n', styles: [] },
      { text: `блок ${ASTRAL}${THUMB}`, styles: ['codeBlock'] },
    ];

    const out = TelegramText.of(text);

    expect(out.text).toBe(PlainText.of(text));
    expect(covered(out)).toEqual(
      [
        { type: 'bold', text: FLAG },
        { type: 'italic', text: ` рука ${THUMB} ` },
        { type: 'strikethrough', text: `caf${E_ACUTE}` },
        { type: 'code', text: `${ASTRAL}x` },
        { type: 'bold', text: `${FAMILY} ссылка` },
        { type: 'text_link', text: `${FAMILY} ссылка` },
        { type: 'blockquote', text: `цитата ${FLAG}${E_ACUTE}` },
        { type: 'pre', text: `блок ${ASTRAL}${THUMB}` },
      ].sort(byTypeAndText),
    );
  });

  test('смещение после семьи с ZWJ — длина в единицах UTF-16, а не в графемах', () => {
    const text: FormattedText = [
      { text: FAMILY, styles: [] },
      { text: 'ж', styles: ['bold'] },
    ];

    expect(TelegramText.of(text).entities).toEqual([
      { type: 'bold', offset: FAMILY.length, length: 1 },
    ]);
    expect(FAMILY.length).toBe(11);
  });

  test('одиночный суррогат — U+FFFD, длина текста и смещения следующих сущностей прежние', () => {
    const text: FormattedText = [
      { text: 'a\uD83D!', styles: ['bold'] },
      { text: 'x\uDC00', styles: ['italic'] },
      { text: 'хвост', styles: ['strike'] },
    ];

    const out = TelegramText.of(text);

    expect(out.text).toBe('a�!x�хвост');
    expect(out.text.length).toBe(PlainText.of(text).length);
    expect(sorted(out.entities)).toEqual([
      { type: 'bold', offset: 0, length: 3 },
      { type: 'italic', offset: 3, length: 2 },
      { type: 'strikethrough', offset: 5, length: 5 },
    ]);
  });

  test('суррогатная пара, разрезанная между фрагментами, остаётся символом', () => {
    const text: FormattedText = [
      { text: 'a\uD83D', styles: ['bold'] },
      { text: '\uDE00b', styles: [] },
    ];

    expect(TelegramText.of(text).text).toBe('a\u{1F600}b');
  });

  test('пустой фрагмент со стилем сущности не даёт', () => {
    const text: FormattedText = [
      { text: '', styles: ['bold'] },
      { text: 'текст', styles: [] },
    ];

    expect(TelegramText.of(text).entities).toEqual([]);
  });
});

describe('TelegramText — вложенность', () => {
  const rich: FormattedText = [
    { text: 'Начало ', styles: ['bold'] },
    {
      text: 'жирная ссылка',
      styles: ['bold', 'italic'],
      link: 'https://example.com',
    },
    { text: '\n', styles: [] },
    { text: 'цитата ', styles: ['quote'] },
    { text: 'жирно', styles: ['bold', 'quote'] },
    { text: ' и ', styles: ['quote'] },
    { text: 'код', styles: ['code', 'quote'] },
    { text: ' и ', styles: ['quote'] },
    {
      text: 'ссылка',
      styles: ['italic', 'quote'],
      link: 'https://example.com/q',
    },
    { text: '\n', styles: [] },
    { text: 'блок', styles: ['codeBlock'] },
    { text: '\n', styles: [] },
    { text: 'код снаружи', styles: ['code'] },
  ];

  test('любые две сущности не пересекаются или одна внутри другой', () => {
    const { entities } = TelegramText.of(rich);

    expect(entities.length).toBeGreaterThan(1);
    for (const [i, a] of entities.entries()) {
      for (const b of entities.slice(i + 1)) {
        expect({ a, b, nested: nested(a, b) }).toEqual({ a, b, nested: true });
      }
    }
  });

  test('цитата из нескольких фрагментов — один blockquote на всю серию', () => {
    const out = TelegramText.of(rich);

    expect(
      covered(out).filter((entity) => entity.type === 'blockquote'),
    ).toEqual([{ type: 'blockquote', text: 'цитата жирно и код и ссылка' }]);
  });

  test('строчный код в цитате — без code, прочие стили цитаты остаются; код снаружи цитаты — code', () => {
    const out = TelegramText.of(rich);
    const inQuote = covered(out).filter((entity) =>
      ['жирно', 'код', 'ссылка'].includes(entity.text),
    );

    expect(inQuote).toEqual(
      [
        { type: 'bold', text: 'жирно' },
        { type: 'italic', text: 'ссылка' },
        { type: 'text_link', text: 'ссылка' },
      ].sort(byTypeAndText),
    );
    expect(covered(out).filter((entity) => entity.type === 'code')).toEqual([
      { type: 'code', text: 'код снаружи' },
    ]);
  });

  test('две серии цитаты, разделённые текстом, — два blockquote', () => {
    const text: FormattedText = [
      { text: 'первая', styles: ['quote'] },
      { text: '\n', styles: [] },
      { text: 'вторая', styles: ['quote'] },
    ];

    expect(sorted(TelegramText.of(text).entities)).toEqual([
      { type: 'blockquote', offset: 0, length: 6 },
      { type: 'blockquote', offset: 7, length: 6 },
    ]);
  });

  test('цитата из построителя — один blockquote, вложенный жирный внутри него', () => {
    const text = new TextBuilder()
      .text('До')
      .quote((inner) => inner.text('мысль ').bold('главное'))
      .text('После')
      .build();

    const out = TelegramText.of(text);
    const quote = out.entities.filter((e) => e.type === 'blockquote');
    const bold = out.entities.filter((e) => e.type === 'bold');

    expect(quote).toHaveLength(1);
    expect(bold).toHaveLength(1);
    expect(nested(quote[0]!, bold[0]!)).toBe(true);
    expect(covered(out)).toContainEqual({ type: 'bold', text: 'главное' });
  });
});

describe('TelegramText — адрес ссылки', () => {
  test.each([
    'javascript:alert(1)',
    'JAVASCRIPT:alert(1)',
    '/relative/path',
    'relative',
    '',
    'ftp://example.com/file',
    'mailto:a@example.com',
    'data:text/html,x',
    'tg://login?token=x',
    'tg://proxy?server=example.com&port=443&secret=x',
    'tg://join?invite=x',
    'tg://userx?id=1',
  ])('«%s» — текст без text_link, прочие стили остаются', (url) => {
    const text: FormattedText = [{ text: 'жми', styles: ['bold'], link: url }];

    expect(TelegramText.of(text)).toEqual({
      text: 'жми',
      entities: [{ type: 'bold', offset: 0, length: 3 }],
    });
  });

  test.each([
    'http://example.com',
    'https://example.com/path?q=1#a',
    'tg://resolve?domain=x',
    'tg://user?id=1',
  ])('«%s» — text_link с адресом как есть', (url) => {
    const text: FormattedText = [{ text: 'жми', styles: [], link: url }];

    expect(TelegramText.of(text)).toEqual({
      text: 'жми',
      entities: [{ type: 'text_link', offset: 0, length: 3, url }],
    });
  });
});

// Момент времени: `date_time` на весь фрагмент, `unix_time` — `at`,
// формат по виду показа; запасной текст — `text`. Смещения — UTF-16.

const AT = 1_800_000_000;

describe('TelegramText — момент времени', () => {
  test.each([
    ['date', 'd'],
    ['time', 't'],
    ['dateTime', 'dt'],
    ['relative', 'r'],
  ] as const)(
    'вид %s → date_time с форматом %s на весь фрагмент',
    (show, format) => {
      const out = TelegramText.of([
        { text: 'Срок: ', styles: [] },
        { text: 'завтра, 18:00', styles: [], moment: { at: AT, show } },
        { text: '.', styles: [] },
      ]);

      expect(out.text).toBe('Срок: завтра, 18:00.');
      expect(out.entities).toEqual([
        {
          type: 'date_time',
          offset: 6,
          length: 13,
          unix_time: AT,
          date_time_format: format,
        },
      ]);
    },
  );

  test('фрагмент без момента сущности date_time не даёт', () => {
    expect(
      TelegramText.of([{ text: 'без даты', styles: [] }]).entities,
    ).toEqual([]);
  });

  test('эмодзи (не-BMP) до фрагмента и внутри запасного текста сдвигают offset и length по code units', () => {
    const out = TelegramText.of([
      { text: `${FAMILY}${ASTRAL} `, styles: [] },
      {
        text: `${THUMB} в 18:00 ${ASTRAL}`,
        styles: [],
        moment: { at: AT, show: 'dateTime' },
      },
      { text: ' конец', styles: [] },
    ]);

    const before = `${FAMILY}${ASTRAL} `.length;
    const inside = `${THUMB} в 18:00 ${ASTRAL}`;
    expect(out.entities).toEqual([
      {
        type: 'date_time',
        offset: before,
        length: inside.length,
        unix_time: AT,
        date_time_format: 'dt',
      },
    ]);
    expect(out.text.slice(before, before + inside.length)).toBe(inside);
  });

  test('момент + bold, italic, strike — обе сущности на тот же диапазон', () => {
    const out = TelegramText.of([
      {
        text: '18:00',
        styles: ['bold', 'italic', 'strike'],
        moment: { at: AT, show: 'time' },
      },
    ]);

    expect(sorted(out.entities).map((e) => e.type)).toEqual([
      'bold',
      'date_time',
      'italic',
      'strikethrough',
    ]);
    for (const entity of out.entities) {
      expect([entity.offset, entity.length]).toEqual([0, 5]);
    }
  });

  test('момент + ссылка — остаётся text_link, date_time снят', () => {
    const out = TelegramText.of([
      {
        text: 'срок',
        styles: [],
        link: 'https://example.com/task',
        moment: { at: AT, show: 'date' },
      },
    ]);

    expect(out.entities).toEqual([
      {
        type: 'text_link',
        offset: 0,
        length: 4,
        url: 'https://example.com/task',
      },
    ]);
  });

  test('момент + отвергнутая ссылка — ссылки нет, date_time остаётся', () => {
    const out = TelegramText.of([
      {
        text: 'срок',
        styles: [],
        link: 'tg://login',
        moment: { at: AT, show: 'date' },
      },
    ]);

    expect(out.entities).toEqual([
      {
        type: 'date_time',
        offset: 0,
        length: 4,
        unix_time: AT,
        date_time_format: 'd',
      },
    ]);
  });

  test('момент + code и момент + codeBlock — момент снят, стиль кода остаётся', () => {
    const moment = { at: AT, show: 'date' } as const;

    expect(
      TelegramText.of([{ text: '2026', styles: ['code'], moment }]).entities,
    ).toEqual([{ type: 'code', offset: 0, length: 4 }]);
    expect(
      TelegramText.of([{ text: '2026', styles: ['codeBlock'], moment }])
        .entities,
    ).toEqual([{ type: 'pre', offset: 0, length: 4 }]);
  });

  test('момент в цитате — blockquote и date_time, момент вложен в цитату', () => {
    const out = TelegramText.of([
      { text: 'Срок ', styles: ['quote'] },
      {
        text: '18:00',
        styles: ['quote'],
        moment: { at: AT, show: 'time' },
      },
    ]);

    expect(out.entities).toEqual([
      { type: 'blockquote', offset: 0, length: 10 },
      {
        type: 'date_time',
        offset: 5,
        length: 5,
        unix_time: AT,
        date_time_format: 't',
      },
    ]);
  });
});
