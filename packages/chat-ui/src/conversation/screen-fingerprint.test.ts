import { describe, expect, test } from 'bun:test';
import { TextBuilder } from '../message/text-builder';
import type { ViewMessage } from '../view/view.types';
import { ScreenFingerprint } from './screen-fingerprint';

// Отпечаток показанного вида — SHA-256 (hex) канонического JSON сообщений
// показа по порядку: текст каждого сообщения и его варианты (вид, имя цели,
// подпись). Ссылки вариантов и заметка перед видом в него не входят.

const MESSAGE: ViewMessage = {
  kind: 'text',
  text: new TextBuilder().bold('Хлеб').text('\nКупить к ужину').build(),
  options: [
    { kind: 'action', name: 'complete', label: 'Выполнить' },
    { kind: 'local', name: 'toggle', label: 'Подробнее' },
    { kind: 'retry', label: 'Повторить' },
  ],
};

const SHOWN: readonly ViewMessage[] = [MESSAGE];

const fingerprint = (messages: readonly ViewMessage[]) =>
  ScreenFingerprint.of(messages);

/** Тот же показ, но у единственного сообщения поменяно поле. */
const changed = (change: Partial<ViewMessage>): readonly ViewMessage[] => [
  { ...MESSAGE, ...change },
];

describe('ScreenFingerprint', () => {
  test('тот же вид — тот же отпечаток', async () => {
    const same: readonly ViewMessage[] = [
      {
        options: [
          { label: 'Выполнить', name: 'complete', kind: 'action' },
          { label: 'Подробнее', name: 'toggle', kind: 'local' },
          { label: 'Повторить', kind: 'retry' },
        ],
        text: new TextBuilder().bold('Хлеб').text('\nКупить к ужину').build(),
        kind: 'text',
      },
    ];

    const print = await fingerprint(SHOWN);

    expect(print).toMatch(/^[0-9a-f]{64}$/);
    expect(await fingerprint(same)).toBe(print);
    expect(await fingerprint(SHOWN)).toBe(print);
  });

  test.each<[string, readonly ViewMessage[]]>([
    [
      'другой текст',
      changed({ text: TextBuilder.of('Молоко\nКупить к ужину') }),
    ],
    [
      'тот же текст в другом стиле',
      changed({ text: TextBuilder.of('Хлеб\nКупить к ужину') }),
    ],
    [
      'другая подпись варианта',
      changed({
        options: [
          { kind: 'action', name: 'complete', label: 'Готово' },
          ...MESSAGE.options.slice(1),
        ],
      }),
    ],
    ['вариантом меньше', changed({ options: MESSAGE.options.slice(0, 2) })],
    [
      'вариантом больше',
      changed({
        options: [
          ...MESSAGE.options,
          { kind: 'action', name: 'remove', label: 'Удалить' },
        ],
      }),
    ],
    [
      'варианты в другом порядке',
      changed({ options: [...MESSAGE.options].reverse() }),
    ],
    [
      'другое действие с той же подписью',
      changed({
        options: [
          { kind: 'action', name: 'archive', label: 'Выполнить' },
          ...MESSAGE.options.slice(1),
        ],
      }),
    ],
    [
      'другой вид цели с той же подписью и именем',
      changed({
        options: [
          { kind: 'local', name: 'complete', label: 'Выполнить' },
          ...MESSAGE.options.slice(1),
        ],
      }),
    ],
    [
      'сообщением больше',
      [{ kind: 'text', text: TextBuilder.of('Список'), options: [] }, MESSAGE],
    ],
    [
      'тот же текст и варианты двумя сообщениями',
      [
        {
          kind: 'text',
          text: new TextBuilder().bold('Хлеб').build(),
          options: [],
        },
        { ...MESSAGE, text: TextBuilder.of('\nКупить к ужину') },
      ],
    ],
  ])('%s — другой отпечаток', async (_, other) => {
    expect(await fingerprint(other)).not.toBe(await fingerprint(SHOWN));
  });

  test('ссылки и заметка перед видом в отпечаток не входят', async () => {
    const withRefsAndNote = [
      {
        ...MESSAGE,
        note: TextBuilder.of('Экран обновился.'),
        options: MESSAGE.options.map((option, i) => ({
          ...option,
          ref: `abcde${i + 1}`,
        })),
      },
    ];

    expect(await fingerprint(withRefsAndNote)).toBe(await fingerprint(SHOWN));
  });

  test('смена только акцента варианта — другой отпечаток; тот же акцент — тот же', async () => {
    const withAccent = (accent: 'primary' | 'positive' | 'danger') =>
      changed({
        options: [
          { kind: 'action', name: 'complete', label: 'Выполнить', accent },
          ...MESSAGE.options.slice(1),
        ],
      });

    const positive = await fingerprint(withAccent('positive'));

    expect(positive).not.toBe(await fingerprint(SHOWN));
    expect(positive).not.toBe(await fingerprint(withAccent('danger')));
    expect(positive).toBe(await fingerprint(withAccent('positive')));
  });

  test('смена только момента — другой отпечаток: время, вид показа, появление и снятие', async () => {
    const at = (moment?: { at: number; show: 'date' | 'time' }) =>
      changed({
        text: [{ text: 'Срок', styles: [], ...(moment && { moment }) }],
      });

    const base = await fingerprint(at({ at: 1_800_000_000, show: 'date' }));

    expect(base).not.toBe(await fingerprint(at()));
    expect(base).not.toBe(
      await fingerprint(at({ at: 1_800_000_060, show: 'date' })),
    );
    expect(base).not.toBe(
      await fingerprint(at({ at: 1_800_000_000, show: 'time' })),
    );
    expect(base).toBe(
      await fingerprint(at({ at: 1_800_000_000, show: 'date' })),
    );
  });
});
