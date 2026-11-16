import { describe, expect, test } from 'bun:test';
import type { FormattedText } from '../message/message.types';
import type { TextLimit } from './limit.types';
import { TextLength } from './text-length';
import { TextSplitter } from './text-splitter';

// Разбиение на части не длиннее лимита. Жадно: в окне до `max` — последняя
// граница высшего приоритета (абзац, строка, пробел), если часть до неё не
// короче `max/2`; иначе — следующий приоритет, в конце — граница графемы.
// Разделитель на месте разреза снимается. Границы внутри ссылки и строчного
// кода не в счёт, пока сам фрагмент укладывается в `max`.

const FAMILY = '\u{1F468}‍\u{1F469}‍\u{1F467}';
const THUMB_TONE = '\u{1F44D}\u{1F3FD}';
const FLAG = '\u{1F1F0}\u{1F1FF}';
const LONE_SURROGATE = '\uD83D';
const HELP = 'https://example.org/help';

const plain = (text: string): FormattedText => [{ text, styles: [] }];

const split = (text: FormattedText, limit: TextLimit) =>
  new TextSplitter(limit).split(text);

/** Код-единицы текста с меткой стиля и ссылки — чтобы сверять склейку вместе с форматом. */
const units = (text: FormattedText) =>
  text.flatMap((fragment) =>
    fragment.text.split('').map((char) => ({
      char,
      mark: JSON.stringify([fragment.styles, fragment.link ?? null]),
    })),
  );

/** Границы графем всего видимого текста, в код-единицах UTF-16. */
const graphemeBoundaries = (text: FormattedText) => {
  const whole = text.map((fragment) => fragment.text).join('');
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  return new Set([
    ...[...segmenter.segment(whole)].map((segment) => segment.index),
    whole.length,
  ]);
};

/**
 * Склейка частей и снятых разделителей даёт исходный текст с теми же стилями
 * и ссылками; между частями снят ровно один разделитель — `\n\n`, `\n`, пробел
 * или ничего (разрез по графеме); разрезы — на границах графем; пустых частей
 * и пустых фрагментов нет. Возвращает снятые разделители.
 */
const expectReassembles = (
  source: FormattedText,
  parts: readonly FormattedText[],
) => {
  const whole = units(source);
  const boundaries = graphemeBoundaries(source);
  const separators: string[] = [];
  let at = 0;

  parts.forEach((part, index) => {
    for (const fragment of part) expect(fragment.text).not.toBe('');
    const piece = units(part);
    expect(piece.length).toBeGreaterThan(0);
    if (index > 0) {
      const gap = [0, 1, 2].find((size) => {
        const separator = whole
          .slice(at, at + size)
          .map((unit) => unit.char)
          .join('');
        return (
          ['', ' ', '\n', '\n\n'].includes(separator) &&
          Bun.deepEquals(
            whole.slice(at + size, at + size + piece.length),
            piece,
          )
        );
      });
      expect(gap).toBeDefined();
      separators.push(
        whole
          .slice(at, at + gap!)
          .map((unit) => unit.char)
          .join(''),
      );
      at += gap!;
    }
    expect(boundaries.has(at)).toBe(true);
    expect(whole.slice(at, at + piece.length)).toEqual(piece);
    at += piece.length;
    expect(boundaries.has(at)).toBe(true);
  });

  expect(at).toBe(whole.length);
  return separators;
};

const expectWithinLimit = (
  parts: readonly FormattedText[],
  limit: TextLimit,
) => {
  const length = new TextLength(limit.unit);
  for (const part of parts) {
    expect(length.of(part)).toBeLessThanOrEqual(limit.max);
  }
};

const PROSE =
  'Первый абзац про хлеб.\n\nВторой абзац, подлиннее первого.\nЕго вторая строка.\n\nТретий.';

const EMOJI = `Ура ${THUMB_TONE}${THUMB_TONE} семья ${FAMILY} флаг ${FLAG}${FLAG} и é конец`;

const FORMATTED: FormattedText = [
  { text: 'Итоги недели:\n', styles: [] },
  { text: 'купили хлеб', styles: ['bold'] },
  { text: ', молоко и ', styles: [] },
  { text: 'сыр', styles: ['bold', 'italic'] },
  { text: '.\n', styles: [] },
  { text: 'Цитата в две\nстроки подряд', styles: ['quote'] },
  { text: '\n', styles: [] },
  { text: 'let total = 3;\nprint(total);', styles: ['codeBlock'] },
  { text: '\nСм. ', styles: [] },
  { text: 'справку', styles: [], link: HELP },
  { text: ' и ', styles: [] },
  { text: 'x = 1', styles: ['code'] },
];

const JOINT: FormattedText = [
  { text: 'abe', styles: [] },
  {
    text: `́ c${LONE_SURROGATE} d éf gh`,
    styles: ['bold'],
  },
];

const PROPERTY_CASES: readonly {
  name: string;
  text: FormattedText;
  limit: TextLimit;
}[] = [
  {
    name: 'абзацы, utf16 10',
    text: plain(PROSE),
    limit: { max: 10, unit: 'utf16' },
  },
  {
    name: 'абзацы, utf16 25',
    text: plain(PROSE),
    limit: { max: 25, unit: 'utf16' },
  },
  {
    name: 'абзацы, utf16 40',
    text: plain(PROSE),
    limit: { max: 40, unit: 'utf16' },
  },
  {
    name: 'абзацы, графемы 15',
    text: plain(PROSE),
    limit: { max: 15, unit: 'grapheme' },
  },
  {
    name: 'эмодзи, utf16 9',
    text: plain(EMOJI),
    limit: { max: 9, unit: 'utf16' },
  },
  {
    name: 'эмодзи, кодовые точки 6',
    text: plain(EMOJI),
    limit: { max: 6, unit: 'codePoint' },
  },
  {
    name: 'эмодзи, utf8 20',
    text: plain(EMOJI),
    limit: { max: 20, unit: 'utf8' },
  },
  {
    name: 'эмодзи, графемы 4',
    text: plain(EMOJI),
    limit: { max: 4, unit: 'grapheme' },
  },
  {
    name: 'формат, utf16 12',
    text: FORMATTED,
    limit: { max: 12, unit: 'utf16' },
  },
  {
    name: 'формат, utf16 20',
    text: FORMATTED,
    limit: { max: 20, unit: 'utf16' },
  },
  {
    name: 'формат, utf16 33',
    text: FORMATTED,
    limit: { max: 33, unit: 'utf16' },
  },
  {
    name: 'формат, графемы 7',
    text: FORMATTED,
    limit: { max: 7, unit: 'grapheme' },
  },
  {
    name: 'стык и суррогат, кодовые точки 3',
    text: JOINT,
    limit: { max: 3, unit: 'codePoint' },
  },
  {
    name: 'стык и суррогат, utf8 5',
    text: JOINT,
    limit: { max: 5, unit: 'utf8' },
  },
  {
    name: 'стык и суррогат, utf16 3',
    text: JOINT,
    limit: { max: 3, unit: 'utf16' },
  },
  {
    name: 'стык и суррогат, графемы 2',
    text: JOINT,
    limit: { max: 2, unit: 'grapheme' },
  },
];

describe('TextSplitter', () => {
  test('уложился — [text], тот же объект внутри; длина ровно max тоже укладывается', () => {
    const text: FormattedText = [
      { text: 'Купить ', styles: [] },
      { text: 'хлеб', styles: ['bold'], link: HELP },
    ];
    const parts = split(text, { max: 11, unit: 'utf16' });

    expect(parts).toHaveLength(1);
    expect(parts[0]).toBe(text);
  });

  test('пустой текст — одна часть без фрагментов, тот же объект', () => {
    const empty: FormattedText = [];
    const parts = split(empty, { max: 5, unit: 'utf16' });

    expect(parts).toEqual([[]]);
    expect(parts[0]).toBe(empty);
  });

  test('разрез по абзацу: абзац важнее более поздних строки и пробела', () => {
    expect(
      split(plain('Первый абзац.\n\nВторой абзац.'), {
        max: 22,
        unit: 'utf16',
      }),
    ).toEqual([plain('Первый абзац.'), plain('Второй абзац.')]);
  });

  test('разрез по строке, когда абзаца в окне нет', () => {
    expect(
      split(plain('Строка один\nСтрока два и три'), { max: 20, unit: 'utf16' }),
    ).toEqual([plain('Строка один'), plain('Строка два и три')]);
  });

  test('абзац даёт часть короче max/2 — разрез по строке', () => {
    expect(
      split(plain('Да.\n\nСтрока подлиннее\nхвост'), {
        max: 24,
        unit: 'utf16',
      }),
    ).toEqual([plain('Да.\n\nСтрока подлиннее'), plain('хвост')]);
  });

  test('разрез по пробелу, когда переводов строки нет', () => {
    expect(
      split(plain('Купить хлеб и молоко к ужину'), { max: 12, unit: 'utf16' }),
    ).toEqual([plain('Купить хлеб'), plain('и молоко к'), plain('ужину')]);
  });

  test('разделитель сразу за окном снимается: часть ровно max', () => {
    expect(split(plain('аааа бббб'), { max: 4, unit: 'utf16' })).toEqual([
      plain('аааа'),
      plain('бббб'),
    ]);
  });

  test('длинное слово режется по графемам', () => {
    expect(split(plain('абвгдежзиклм'), { max: 5, unit: 'utf16' })).toEqual([
      plain('абвгд'),
      plain('ежзик'),
      plain('лм'),
    ]);
  });

  test('пробел даёт часть короче max/2 — разрез по графеме', () => {
    expect(split(plain('да абвгдежзик'), { max: 6, unit: 'utf16' })).toEqual([
      plain('да абв'),
      plain('гдежзи'),
      plain('к'),
    ]);
  });

  test('цепочка эмодзи при utf16 режется между графемами', () => {
    expect(
      split(plain(THUMB_TONE.repeat(3)), { max: 10, unit: 'utf16' }),
    ).toEqual([plain(THUMB_TONE.repeat(2)), plain(THUMB_TONE)]);
    expect(
      split(plain(THUMB_TONE.repeat(3)), { max: 6, unit: 'utf16' }),
    ).toEqual([plain(THUMB_TONE), plain(THUMB_TONE), plain(THUMB_TONE)]);
    expect(
      split(plain(`ok${FAMILY}${FAMILY}`), { max: 10, unit: 'utf16' }),
    ).toEqual([plain(`ok${FAMILY}`), plain(FAMILY)]);
  });

  test('флаг, e с акцентом и одиночный суррогат не режутся', () => {
    expect(split(plain(`${FLAG}${FLAG}`), { max: 6, unit: 'utf16' })).toEqual([
      plain(FLAG),
      plain(FLAG),
    ]);
    expect(split(plain('ééé'), { max: 3, unit: 'codePoint' })).toEqual([
      plain('é'),
      plain('é'),
      plain('é'),
    ]);
    expect(
      split(plain(`a${LONE_SURROGATE}b`), { max: 4, unit: 'utf8' }),
    ).toEqual([plain(`a${LONE_SURROGATE}`), plain('b')]);
  });

  test('графема на стыке фрагментов (e | акцент) не режется', () => {
    const text: FormattedText = [
      { text: 'abe', styles: [] },
      { text: '́cd', styles: ['bold'] },
    ];

    expect(split(text, { max: 3, unit: 'codePoint' })).toEqual([
      plain('ab'),
      [
        { text: 'e', styles: [] },
        { text: '́c', styles: ['bold'] },
      ],
      [{ text: 'd', styles: ['bold'] }],
    ]);
  });

  test.each(PROPERTY_CASES)(
    'каждая часть не длиннее лимита в своей единице: $name',
    ({ text, limit }) => {
      const parts = split(text, limit);

      expect(parts.length).toBeGreaterThan(1);
      expectWithinLimit(parts, limit);
    },
  );

  test.each(PROPERTY_CASES)(
    'склейка частей и снятых разделителей даёт исходный текст: $name',
    ({ text, limit }) => {
      expectReassembles(text, split(text, limit));
    },
  );

  test('снятые разделители — те, по которым шёл разрез', () => {
    const text = plain('Первый абзац.\n\nСтрока один\nСтрока два и ещё слова');
    const parts = split(text, { max: 16, unit: 'utf16' });

    expect(parts).toEqual([
      plain('Первый абзац.'),
      plain('Строка один'),
      plain('Строка два и ещё'),
      plain('слова'),
    ]);
    expect(expectReassembles(text, parts)).toEqual(['\n\n', '\n', ' ']);
  });

  test('жирный продолжается в следующей части', () => {
    const text: FormattedText = [
      { text: 'Важно: ', styles: [] },
      { text: 'купить хлеб и молоко', styles: ['bold'] },
    ];

    expect(split(text, { max: 15, unit: 'utf16' })).toEqual([
      [
        { text: 'Важно: ', styles: [] },
        { text: 'купить', styles: ['bold'] },
      ],
      [{ text: 'хлеб и молоко', styles: ['bold'] }],
    ]);
  });

  test('цитата продолжается в следующей части', () => {
    const text: FormattedText = [
      { text: 'Цитата:\n', styles: [] },
      { text: 'первая строка\nвторая строка', styles: ['quote'] },
    ];

    expect(split(text, { max: 25, unit: 'utf16' })).toEqual([
      [
        { text: 'Цитата:\n', styles: [] },
        { text: 'первая строка', styles: ['quote'] },
      ],
      [{ text: 'вторая строка', styles: ['quote'] }],
    ]);
  });

  test('блок кода режется по своей строке, обе части — блоки кода', () => {
    const text: FormattedText = [
      { text: 'Пример:\n', styles: [] },
      { text: 'const a = 1;\nconst b = 2;', styles: ['codeBlock'] },
    ];

    expect(split(text, { max: 24, unit: 'utf16' })).toEqual([
      [
        { text: 'Пример:\n', styles: [] },
        { text: 'const a = 1;', styles: ['codeBlock'] },
      ],
      [{ text: 'const b = 2;', styles: ['codeBlock'] }],
    ]);
  });

  test('ссылка не режется, пока укладывается, — уезжает в следующую часть целиком', () => {
    const text: FormattedText = [
      { text: 'Подробности по ссылке ', styles: [] },
      { text: 'полная справка', styles: [], link: HELP },
    ];

    expect(split(text, { max: 30, unit: 'utf16' })).toEqual([
      plain('Подробности по ссылке'),
      [{ text: 'полная справка', styles: [], link: HELP }],
    ]);
  });

  test('строчный код не режется, пока укладывается, — уезжает в следующую часть целиком', () => {
    const text: FormattedText = [
      { text: 'Запусти команду ', styles: [] },
      { text: 'x = a + b', styles: ['code'] },
    ];

    expect(split(text, { max: 20, unit: 'utf16' })).toEqual([
      plain('Запусти команду'),
      [{ text: 'x = a + b', styles: ['code'] }],
    ]);
  });

  test('ссылка длиннее лимита режется по своим границам, обе части — та же ссылка', () => {
    const text: FormattedText = [
      { text: 'полная справка по разделу', styles: [], link: HELP },
    ];

    expect(split(text, { max: 15, unit: 'utf16' })).toEqual([
      [{ text: 'полная справка', styles: [], link: HELP }],
      [{ text: 'по разделу', styles: [], link: HELP }],
    ]);
  });

  test('графема длиннее лимита — отдельной частью целиком, без зацикливания', () => {
    expect(split(plain(`ab${FAMILY}cd`), { max: 4, unit: 'utf16' })).toEqual([
      plain('ab'),
      plain(FAMILY),
      plain('cd'),
    ]);
    expect(split(plain(FAMILY), { max: 4, unit: 'utf8' })).toEqual([
      plain(FAMILY),
    ]);
  });
});
