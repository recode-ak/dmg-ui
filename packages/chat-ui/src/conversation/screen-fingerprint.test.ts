import { describe, expect, test } from 'bun:test';
import { TextBuilder } from '../message/text-builder';
import type { ShownScreen } from './conversation.types';
import { ScreenFingerprint } from './screen-fingerprint';

// Отпечаток показанного вида — SHA-256 (hex) канонического JSON: текст тела и
// варианты (вид, имя цели, подпись) по порядку. Ссылки вариантов и заметка
// перед видом в него не входят.

const SHOWN: ShownScreen = {
  text: new TextBuilder().bold('Хлеб').text('\nКупить к ужину').build(),
  options: [
    { kind: 'action', name: 'complete', label: 'Выполнить' },
    { kind: 'local', name: 'toggle', label: 'Подробнее' },
    { kind: 'retry', label: 'Повторить' },
  ],
};

const fingerprint = (shown: ShownScreen) => ScreenFingerprint.of(shown);

describe('ScreenFingerprint', () => {
  test('тот же вид — тот же отпечаток', async () => {
    const same: ShownScreen = {
      options: [
        { label: 'Выполнить', name: 'complete', kind: 'action' },
        { label: 'Подробнее', name: 'toggle', kind: 'local' },
        { label: 'Повторить', kind: 'retry' },
      ],
      text: new TextBuilder().bold('Хлеб').text('\nКупить к ужину').build(),
    };

    const print = await fingerprint(SHOWN);

    expect(print).toMatch(/^[0-9a-f]{64}$/);
    expect(await fingerprint(same)).toBe(print);
    expect(await fingerprint(SHOWN)).toBe(print);
  });

  test.each<[string, ShownScreen]>([
    [
      'другой текст',
      { ...SHOWN, text: TextBuilder.of('Молоко\nКупить к ужину') },
    ],
    [
      'тот же текст в другом стиле',
      { ...SHOWN, text: TextBuilder.of('Хлеб\nКупить к ужину') },
    ],
    [
      'другая подпись варианта',
      {
        ...SHOWN,
        options: [
          { kind: 'action', name: 'complete', label: 'Готово' },
          ...SHOWN.options.slice(1),
        ],
      },
    ],
    ['вариантом меньше', { ...SHOWN, options: SHOWN.options.slice(0, 2) }],
    [
      'вариантом больше',
      {
        ...SHOWN,
        options: [
          ...SHOWN.options,
          { kind: 'action', name: 'remove', label: 'Удалить' },
        ],
      },
    ],
    [
      'варианты в другом порядке',
      { ...SHOWN, options: [...SHOWN.options].reverse() },
    ],
    [
      'другое действие с той же подписью',
      {
        ...SHOWN,
        options: [
          { kind: 'action', name: 'archive', label: 'Выполнить' },
          ...SHOWN.options.slice(1),
        ],
      },
    ],
    [
      'другой вид цели с той же подписью и именем',
      {
        ...SHOWN,
        options: [
          { kind: 'local', name: 'complete', label: 'Выполнить' },
          ...SHOWN.options.slice(1),
        ],
      },
    ],
  ])('%s — другой отпечаток', async (_, other) => {
    expect(await fingerprint(other)).not.toBe(await fingerprint(SHOWN));
  });

  test('ссылки и заметка перед видом в отпечаток не входят', async () => {
    const withRefsAndNote = {
      note: TextBuilder.of('Экран обновился.'),
      text: SHOWN.text,
      options: SHOWN.options.map((option, i) => ({
        ...option,
        ref: `abcde${i + 1}`,
      })),
    };

    expect(await fingerprint(withRefsAndNote)).toBe(await fingerprint(SHOWN));
  });
});
