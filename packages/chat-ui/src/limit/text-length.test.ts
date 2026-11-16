import { describe, expect, test } from 'bun:test';
import type { FormattedText } from '../message/message.types';
import type { LengthUnit } from './limit.types';
import { TextLength } from './text-length';

// Длина видимого текста в единице лимита. Составные символы — то, на чём
// единицы расходятся: графема одна, а кодовых точек, UTF-16 и байт больше.
// Графемы считаются по всему тексту, а не по фрагменту.

const FAMILY = '\u{1F468}‍\u{1F469}‍\u{1F467}';
const THUMB_TONE = '\u{1F44D}\u{1F3FD}';
const FLAG = '\u{1F1F0}\u{1F1FF}';
const KEYCAP = '1️⃣';
const LONE_SURROGATE = '\uD83D';

type Lengths = Record<LengthUnit, number>;

const ROWS: readonly { name: string; value: string; lengths: Lengths }[] = [
  {
    name: 'латиница',
    value: 'abc',
    lengths: { grapheme: 3, codePoint: 3, utf16: 3, utf8: 3 },
  },
  {
    name: 'é одной точкой',
    value: 'é',
    lengths: { grapheme: 1, codePoint: 1, utf16: 1, utf8: 2 },
  },
  {
    name: 'e и комбинируемый акцент',
    value: 'é',
    lengths: { grapheme: 1, codePoint: 2, utf16: 2, utf8: 3 },
  },
  {
    name: 'тон кожи',
    value: THUMB_TONE,
    lengths: { grapheme: 1, codePoint: 2, utf16: 4, utf8: 8 },
  },
  {
    name: 'семья ZWJ',
    value: FAMILY,
    lengths: { grapheme: 1, codePoint: 5, utf16: 8, utf8: 18 },
  },
  {
    name: 'флаг',
    value: FLAG,
    lengths: { grapheme: 1, codePoint: 2, utf16: 4, utf8: 8 },
  },
  {
    name: 'цифра в рамке',
    value: KEYCAP,
    lengths: { grapheme: 1, codePoint: 3, utf16: 3, utf8: 7 },
  },
  {
    name: 'одиночный суррогат',
    value: LONE_SURROGATE,
    lengths: { grapheme: 1, codePoint: 1, utf16: 1, utf8: 3 },
  },
  {
    name: 'кириллица',
    value: 'Хлеб',
    lengths: { grapheme: 4, codePoint: 4, utf16: 4, utf8: 8 },
  },
  {
    name: 'пустая строка',
    value: '',
    lengths: { grapheme: 0, codePoint: 0, utf16: 0, utf8: 0 },
  },
];

const UNITS: readonly { unit: LengthUnit }[] = [
  { unit: 'grapheme' },
  { unit: 'codePoint' },
  { unit: 'utf16' },
  { unit: 'utf8' },
];

/** Длины всех строк таблицы по имени строки: так в падении видно, какая строка разошлась. */
const lengthsBy = (measure: (value: string) => number) =>
  Object.fromEntries(ROWS.map((row) => [row.name, measure(row.value)]));

const expectedIn = (unit: LengthUnit) =>
  Object.fromEntries(ROWS.map((row) => [row.name, row.lengths[unit]]));

describe('TextLength', () => {
  test.each(UNITS)('длина строки в единице $unit', ({ unit }) => {
    const length = new TextLength(unit);

    expect(lengthsBy((value) => length.ofString(value))).toEqual(
      expectedIn(unit),
    );
  });

  test.each(UNITS)(
    'длина текста из одного фрагмента в единице $unit — как у его строки',
    ({ unit }) => {
      const length = new TextLength(unit);

      expect(
        lengthsBy((value) => length.of([{ text: value, styles: ['bold'] }])),
      ).toEqual(expectedIn(unit));
    },
  );

  test('длина текста — по видимому тексту: подпись ссылки считается, адрес нет', () => {
    const text: FormattedText = [
      { text: 'см. ', styles: [] },
      {
        text: 'справку',
        styles: ['bold'],
        link: 'https://example.org/a/very/long/address/of/the/help/page',
      },
    ];

    expect(new TextLength('grapheme').of(text)).toBe(11);
    expect(new TextLength('codePoint').of(text)).toBe(11);
    expect(new TextLength('utf16').of(text)).toBe(11);
    expect(new TextLength('utf8').of(text)).toBe(20);
  });

  test('графема на стыке фрагментов (e | акцент) — одна графема', () => {
    const text: FormattedText = [
      { text: 'ae', styles: [] },
      { text: '́b', styles: ['bold'] },
    ];

    expect(new TextLength('grapheme').of(text)).toBe(3);
    expect(new TextLength('codePoint').of(text)).toBe(4);
    expect(new TextLength('utf16').of(text)).toBe(4);
    expect(new TextLength('utf8').of(text)).toBe(5);
  });

  test('пустой текст — 0 в каждой единице', () => {
    for (const { unit } of UNITS) {
      expect(new TextLength(unit).of([])).toBe(0);
    }
  });

  test('неизвестная единица (значение не по типу, из JSON) — бросок с именем единицы', () => {
    const unit = JSON.parse('"byte"');

    expect(() => new TextLength(unit).ofString('abc')).toThrow('byte');
  });
});
