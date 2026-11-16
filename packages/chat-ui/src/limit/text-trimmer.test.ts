import { describe, expect, test } from 'bun:test';
import type { FormattedText } from '../message/message.types';
import type { LengthUnit } from './limit.types';
import { TextLength } from './text-length';
import { TextTrimmer } from './text-trimmer';

// Обрезка до лимита: бюджет — `max` минус длина `…` в единице лимита; графемы
// всего текста берутся целиком, пока укладываются в бюджет; хвостовые пробелы
// снимаются; `…` дописывается в последний оставленный фрагмент и наследует его
// стили и ссылку.

const FAMILY = '\u{1F468}‍\u{1F469}‍\u{1F467}';
const THUMB_TONE = '\u{1F44D}\u{1F3FD}';
const FLAG = '\u{1F1F0}\u{1F1FF}';
const KEYCAP = '1️⃣';
const LONE_SURROGATE = '\uD83D';
const HELP = 'https://example.org/help';

const plain = (text: string): FormattedText => [{ text, styles: [] }];

type Lengths = Record<LengthUnit, number>;

const UNITS: readonly LengthUnit[] = ['grapheme', 'codePoint', 'utf16', 'utf8'];

/** Длина `…` (U+2026) в каждой единице. */
const ELLIPSIS_LENGTH: Lengths = {
  grapheme: 1,
  codePoint: 1,
  utf16: 1,
  utf8: 3,
};

const COMPOSITES: readonly { name: string; value: string; lengths: Lengths }[] =
  [
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
      name: 'тон кожи',
      value: THUMB_TONE,
      lengths: { grapheme: 1, codePoint: 2, utf16: 4, utf8: 8 },
    },
    {
      name: 'e и комбинируемый акцент',
      value: 'é',
      lengths: { grapheme: 1, codePoint: 2, utf16: 2, utf8: 3 },
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
  ];

const COMPOSITE_CASES = COMPOSITES.flatMap(({ name, value, lengths }) =>
  UNITS.map((unit) => ({ name, value, unit, length: lengths[unit] })),
);

describe('TextTrimmer', () => {
  test('уложился — тот же объект; длина ровно max тоже укладывается', () => {
    const text: FormattedText = [
      { text: 'Купить ', styles: [] },
      { text: 'хлеб', styles: ['bold'], link: HELP },
    ];
    const trimmer = new TextTrimmer({ max: 11, unit: 'utf16' });

    expect(trimmer.trim(text)).toBe(text);
    expect(trimmer.trimString('Купить хлеб')).toBe('Купить хлеб');
  });

  test('адрес ссылки в длину не входит: короткая подпись с длинным адресом укладывается', () => {
    const text: FormattedText = [
      {
        text: 'справка',
        styles: [],
        link: 'https://example.org/a/very/long/address/of/the/help/page',
      },
    ];

    expect(new TextTrimmer({ max: 7, unit: 'utf16' }).trim(text)).toBe(text);
  });

  test('abcdefgh при utf16 5 — abcd…, длина результата не больше max', () => {
    const trimmed = new TextTrimmer({ max: 5, unit: 'utf16' }).trim(
      plain('abcdefgh'),
    );

    expect(trimmed).toEqual(plain('abcd…'));
    expect(new TextLength('utf16').of(trimmed)).toBeLessThanOrEqual(5);
  });

  test('бюджет — max минус длина … в единице: в utf8 многоточие стоит 3 байта', () => {
    const trimmed = new TextTrimmer({ max: 5, unit: 'utf8' }).trim(
      plain('abcdefgh'),
    );

    expect(trimmed).toEqual(plain('ab…'));
    expect(new TextLength('utf8').of(trimmed)).toBe(5);
  });

  test.each(COMPOSITE_CASES)(
    '$name в единице $unit — целиком уходит или целиком остаётся',
    ({ value, unit, length }) => {
      const text = plain(`a${value}bcde`);
      const reserve = ELLIPSIS_LENGTH[unit] + 1;

      expect(
        new TextTrimmer({ max: reserve + length - 1, unit }).trim(text),
      ).toEqual(plain('a…'));
      expect(
        new TextTrimmer({ max: reserve + length, unit }).trim(text),
      ).toEqual(plain(`a${value}…`));
    },
  );

  test('графема на стыке фрагментов (e | акцент) не режется', () => {
    const text: FormattedText = [
      { text: 'abe', styles: [] },
      { text: '́cd', styles: ['bold'] },
    ];

    expect(new TextTrimmer({ max: 4, unit: 'codePoint' }).trim(text)).toEqual(
      plain('ab…'),
    );
    expect(new TextTrimmer({ max: 3, unit: 'grapheme' }).trim(text)).toEqual(
      plain('ab…'),
    );
    expect(new TextTrimmer({ max: 5, unit: 'codePoint' }).trim(text)).toEqual([
      { text: 'abe', styles: [] },
      { text: '́…', styles: ['bold'] },
    ]);
  });

  test('хвостовые пробелы перед … снимаются', () => {
    expect(
      new TextTrimmer({ max: 8, unit: 'utf16' }).trim(plain('Купить хлеб')),
    ).toEqual(plain('Купить…'));
    expect(
      new TextTrimmer({ max: 5, unit: 'utf16' }).trim(plain('ab   cdef')),
    ).toEqual(plain('ab…'));
  });

  test('хвостовой перевод строки перед … тоже снимается', () => {
    expect(
      new TextTrimmer({ max: 6, unit: 'utf16' }).trim(plain('Итог\nдалее')),
    ).toEqual(plain('Итог…'));
  });

  test('последний оставленный фрагмент из одних пробелов — … остаётся в нём', () => {
    const text: FormattedText = [
      { text: 'ab', styles: ['bold'] },
      { text: '  cdef', styles: [] },
    ];

    expect(new TextTrimmer({ max: 5, unit: 'utf16' }).trim(text)).toEqual([
      { text: 'ab', styles: ['bold'] },
      { text: '…', styles: [] },
    ]);
  });

  test('… наследует стиль жирного фрагмента', () => {
    const text: FormattedText = [
      { text: 'Итог: ', styles: [] },
      { text: 'очень длинный', styles: ['bold'] },
    ];

    expect(new TextTrimmer({ max: 10, unit: 'utf16' }).trim(text)).toEqual([
      { text: 'Итог: ', styles: [] },
      { text: 'оче…', styles: ['bold'] },
    ]);
  });

  test('разрез внутри подписи ссылки — подпись укорочена, адрес прежний', () => {
    const text: FormattedText = [
      { text: 'см. ', styles: [] },
      { text: 'подробную справку', styles: [], link: HELP },
    ];

    expect(new TextTrimmer({ max: 12, unit: 'utf16' }).trim(text)).toEqual([
      { text: 'см. ', styles: [] },
      { text: 'подробн…', styles: [], link: HELP },
    ]);
  });

  test('разрез внутри блока кода — блок остаётся блоком', () => {
    const text: FormattedText = [
      { text: 'Пример:\n', styles: [] },
      { text: 'const a = 1;\nconst b = 2;', styles: ['codeBlock'] },
    ];

    expect(new TextTrimmer({ max: 20, unit: 'utf16' }).trim(text)).toEqual([
      { text: 'Пример:\n', styles: [] },
      { text: 'const a = 1…', styles: ['codeBlock'] },
    ]);
  });

  test('фрагменты после разреза отбрасываются', () => {
    const text: FormattedText = [
      { text: 'раз ', styles: [] },
      { text: 'два', styles: ['italic'] },
      { text: ' три', styles: [] },
      { text: 'четыре', styles: ['bold'] },
    ];

    expect(new TextTrimmer({ max: 7, unit: 'utf16' }).trim(text)).toEqual([
      { text: 'раз ', styles: [] },
      { text: 'дв…', styles: ['italic'] },
    ]);
  });

  test('не осталось ничего — одно … без стилей', () => {
    expect(
      new TextTrimmer({ max: 5, unit: 'utf16' }).trim([
        { text: `${FAMILY} семья`, styles: ['bold'] },
      ]),
    ).toEqual(plain('…'));
  });

  test('max 1 — …', () => {
    expect(
      new TextTrimmer({ max: 1, unit: 'utf16' }).trim(plain('abc')),
    ).toEqual(plain('…'));
    expect(
      new TextTrimmer({ max: 1, unit: 'grapheme' }).trim([
        { text: 'abc', styles: ['bold'], link: HELP },
      ]),
    ).toEqual(plain('…'));
    expect(new TextTrimmer({ max: 1, unit: 'utf16' }).trimString('abc')).toBe(
      '…',
    );
  });

  test('trimString у подписи — в графемах: семья ZWJ считается одной', () => {
    const trimmer = new TextTrimmer({ max: 5, unit: 'grapheme' });

    expect(trimmer.trimString(`Да ${FAMILY} семья`)).toBe(`Да ${FAMILY}…`);
    expect(trimmer.trimString(THUMB_TONE.repeat(6))).toBe(
      `${THUMB_TONE.repeat(4)}…`,
    );
    expect(trimmer.trimString(THUMB_TONE.repeat(5))).toBe(THUMB_TONE.repeat(5));
  });

  test('trimString снимает хвостовые пробелы перед …', () => {
    expect(
      new TextTrimmer({ max: 8, unit: 'grapheme' }).trimString('Купить хлеб'),
    ).toBe('Купить…');
  });
});
