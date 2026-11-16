import { describe, expect, test } from 'bun:test';
import * as v from 'valibot';
import { MemoryMessenger } from '../../testing';
import { MessengerCapabilitiesSchema } from './capabilities-schema';
import type { MessengerCapabilities } from './messenger.types';

// Схема возможностей мессенджера: пределы — целые не меньше 1 (у лимита
// текста — не меньше длины `…` в его единице), окно инициативы — целое число
// миллисекунд не меньше 1, виды сообщений содержат `text`. Схема нестрогая:
// пакет мессенджера вправе добавить свои поля.

const DAY = 86_400_000;

const CAPABILITIES: MessengerCapabilities = {
  name: 'проба',
  kinds: ['text'],
  edit: true,
  text: { max: 4096, unit: 'utf16' },
  textWithOptions: { max: 1024, unit: 'codePoint' },
  options: { max: 3, label: { max: 20, unit: 'grapheme' }, ref: 64 },
  pressAnswer: { max: 200, unit: 'utf8' },
  form: false,
  initiative: { kind: 'window', ms: DAY },
  community: { signals: ['joined'], operations: ['invite'] },
};

const valid = (value: unknown) =>
  v.safeParse(MessengerCapabilitiesSchema, value).success;

/** Возможности с подменённым лимитом текста в одном из четырёх мест. */
const withTextLimit = (
  place: 'text' | 'textWithOptions' | 'label' | 'pressAnswer',
  limit: unknown,
): unknown => {
  if (place === 'label')
    return {
      ...CAPABILITIES,
      options: { ...CAPABILITIES.options, label: limit },
    };
  return { ...CAPABILITIES, [place]: limit };
};

const TEXT_LIMIT_PLACES = [
  'text',
  'textWithOptions',
  'label',
  'pressAnswer',
] as const;

describe('MessengerCapabilitiesSchema', () => {
  test('исходные возможности пробы — по схеме', () => {
    expect(valid(CAPABILITIES)).toBe(true);
  });

  test.each([
    ['editing', () => MemoryMessenger.editing().capabilities],
    ['windowed', () => MemoryMessenger.windowed(() => 0).capabilities],
  ])(
    'набор подставного мессенджера %s проходит схему и круг JSON без изменений',
    (_, of) => {
      const capabilities = of();
      const round = JSON.parse(JSON.stringify(capabilities));

      expect(round).toStrictEqual(capabilities);
      expect(v.parse(MessengerCapabilitiesSchema, round)).toStrictEqual(
        capabilities,
      );
    },
  );

  test('без ответа на нажатие — по схеме', () => {
    const { pressAnswer, ...rest } = CAPABILITIES;

    expect(valid(rest)).toBe(true);
  });

  test.each(TEXT_LIMIT_PLACES)('max 0 у лимита %s — не по схеме', (place) => {
    expect(valid(withTextLimit(place, { max: 0, unit: 'utf16' }))).toBe(false);
  });

  test.each(TEXT_LIMIT_PLACES)(
    'дробный max у лимита %s — не по схеме',
    (place) => {
      expect(valid(withTextLimit(place, { max: 10.5, unit: 'utf16' }))).toBe(
        false,
      );
    },
  );

  test.each(TEXT_LIMIT_PLACES)(
    'неизвестная единица у лимита %s — не по схеме',
    (place) => {
      expect(valid(withTextLimit(place, { max: 10, unit: 'byte' }))).toBe(
        false,
      );
    },
  );

  test.each(TEXT_LIMIT_PLACES)(
    'utf8 у лимита %s: max 2 короче знака обрезки — не по схеме, max 3 — по схеме',
    (place) => {
      expect(valid(withTextLimit(place, { max: 2, unit: 'utf8' }))).toBe(false);
      expect(valid(withTextLimit(place, { max: 3, unit: 'utf8' }))).toBe(true);
    },
  );

  test.each(['grapheme', 'codePoint', 'utf16'] as const)(
    'единица %s: max 1 — по схеме',
    (unit) => {
      for (const place of TEXT_LIMIT_PLACES)
        expect(valid(withTextLimit(place, { max: 1, unit }))).toBe(true);
    },
  );

  test.each([
    ['0', 0],
    ['дробное', 2.5],
    ['отрицательное', -1],
  ])('число вариантов %s — не по схеме', (_, max) => {
    expect(
      valid({ ...CAPABILITIES, options: { ...CAPABILITIES.options, max } }),
    ).toBe(false);
  });

  test.each([
    ['0', 0],
    ['дробная', 8.5],
  ])('длина короткой ссылки %s — не по схеме', (_, ref) => {
    expect(
      valid({ ...CAPABILITIES, options: { ...CAPABILITIES.options, ref } }),
    ).toBe(false);
  });

  test('max 1 у числа вариантов и у короткой ссылки — по схеме', () => {
    expect(
      valid({
        ...CAPABILITIES,
        options: { ...CAPABILITIES.options, max: 1, ref: 1 },
      }),
    ).toBe(true);
  });

  test('виды сообщений без text — не по схеме', () => {
    expect(valid({ ...CAPABILITIES, kinds: ['image'] })).toBe(false);
    expect(valid({ ...CAPABILITIES, kinds: [] })).toBe(false);
  });

  test('все пять видов сообщений — по схеме, неизвестный вид — нет', () => {
    expect(
      valid({
        ...CAPABILITIES,
        kinds: ['text', 'image', 'audio', 'video', 'document'],
      }),
    ).toBe(true);
    expect(valid({ ...CAPABILITIES, kinds: ['text', 'sticker'] })).toBe(false);
  });

  test.each([
    ['0', 0],
    ['дробное', 1.5],
  ])('окно инициативы %s мс — не по схеме', (_, ms) => {
    expect(valid({ ...CAPABILITIES, initiative: { kind: 'window', ms } })).toBe(
      false,
    );
  });

  test('окно инициативы 1 мс, always и afterContact — по схеме', () => {
    for (const initiative of [
      { kind: 'window', ms: 1 },
      { kind: 'always' },
      { kind: 'afterContact' },
    ])
      expect(valid({ ...CAPABILITIES, initiative })).toBe(true);
  });

  test('неизвестный вид инициативы — не по схеме', () => {
    expect(valid({ ...CAPABILITIES, initiative: { kind: 'never' } })).toBe(
      false,
    );
  });

  test('неизвестный сигнал или операция сообщества — не по схеме', () => {
    expect(
      valid({
        ...CAPABILITIES,
        community: { signals: ['banned'], operations: [] },
      }),
    ).toBe(false);
    expect(
      valid({
        ...CAPABILITIES,
        community: { signals: [], operations: ['delete'] },
      }),
    ).toBe(false);
  });

  test('пропущенное обязательное поле — не по схеме', () => {
    const { edit, ...rest } = CAPABILITIES;

    expect(valid(rest)).toBe(false);
  });

  test('лишнее поле мессенджера не роняет схему', () => {
    expect(
      valid({
        ...CAPABILITIES,
        replyQuote: true,
        options: { ...CAPABILITIES.options, color: true },
      }),
    ).toBe(true);
  });
});
