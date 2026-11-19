import { describe, expect, test } from 'bun:test';
import { F } from 'dmg-core';
import * as v from 'valibot';
import { FieldDescription } from './field-description';
import type { FieldShape } from './field-description.types';
import { FIELD_HINT_KEY, fieldHint } from './field-hint';

// Описание поля по схеме valibot: подпись, вид, обязательность, подсказка,
// пример и пределы. Слой не знает ни экрана, ни UI: выход — данные JSON.

/** Описание поля `field` под именем `name` (по умолчанию `f`). */
const shape = (entry: v.GenericSchema, name = 'f'): FieldShape =>
  new FieldDescription(name, entry).describe();

describe('FieldDescription — подпись', () => {
  test('title побеждает description', () => {
    const entry = v.pipe(v.string(), v.description('Описание'), v.title('Имя'));

    expect(shape(entry).label).toBe('Имя');
  });

  test('только description — подпись из него', () => {
    expect(shape(v.pipe(v.string(), v.description('Описание'))).label).toBe(
      'Описание',
    );
  });

  test('ни title, ни description — подпись равна имени поля', () => {
    expect(shape(v.string(), 'owner').label).toBe('owner');
  });

  test('title на обёрнутой схеме необязательного поля — подпись из него', () => {
    const entry = v.optional(v.pipe(v.string(), v.title('Внутри')));

    expect(shape(entry).label).toBe('Внутри');
  });

  test('title обёрнутой схемы раньше description самого поля', () => {
    const entry = v.pipe(
      v.optional(v.pipe(v.string(), v.title('Заголовок внутри'))),
      v.description('Описание снаружи'),
    );

    expect(shape(entry).label).toBe('Заголовок внутри');
  });

  test('description самого поля раньше description обёрнутой схемы', () => {
    const outer = v.pipe(
      v.optional(v.pipe(v.string(), v.description('Внутри'))),
      v.description('Снаружи'),
    );
    const inner = v.optional(v.pipe(v.string(), v.description('Внутри')));

    expect(shape(outer).label).toBe('Снаружи');
    expect(shape(inner).label).toBe('Внутри');
  });
});

describe('FieldDescription — обязательность', () => {
  test('обычное поле обязательное', () => {
    expect(shape(v.string()).optional).toBe(false);
  });

  test.each([
    ['optional', v.optional(v.string())],
    ['exact_optional', v.exactOptional(v.string())],
    ['nullish', v.nullish(v.string())],
  ])('%s — необязательное, вид берётся с обёрнутой схемы', (_, entry) => {
    expect(shape(entry)).toMatchObject({ optional: true, kind: 'string' });
  });

  test('optional над числом — вид number, пределы с обёрнутой схемы', () => {
    const entry = v.optional(
      v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(9)),
    );

    expect(shape(entry)).toMatchObject({
      optional: true,
      kind: 'number',
      limits: { min: 1, max: 9, integer: true },
    });
  });
});

describe('FieldDescription — вид поля', () => {
  test('строка — string', () => {
    expect(shape(v.string()).kind).toBe('string');
  });

  test('число — number', () => {
    expect(shape(v.number()).kind).toBe('number');
  });

  test('булево — boolean', () => {
    expect(shape(v.boolean()).kind).toBe('boolean');
  });

  test('picklist — choice с вариантами options', () => {
    const entry = v.picklist(['low', 'high']);

    expect(shape(entry)).toMatchObject({
      kind: 'choice',
      options: ['low', 'high'],
    });
  });

  test('picklist в pipe с подписью — choice, подпись читается', () => {
    const entry = F.picklist(['low', 'high'], 'Приоритет');

    expect(shape(entry)).toMatchObject({
      kind: 'choice',
      label: 'Приоритет',
      options: ['low', 'high'],
    });
  });

  test('enum — choice', () => {
    expect(shape(v.enum({ Low: 'low', High: 'high' })).kind).toBe('choice');
  });

  test('union литералов — choice', () => {
    const entry = v.union([v.literal('a'), v.literal('b')]);

    expect(shape(entry).kind).toBe('choice');
  });

  test.each([
    ['isoDate', v.pipe(v.string(), v.isoDate())],
    ['isoDateTime', v.pipe(v.string(), v.isoDateTime())],
    ['isoTimestamp', v.pipe(v.string(), v.isoTimestamp())],
  ])('дата ISO (%s) — date', (_, entry) => {
    expect(shape(entry).kind).toBe('date');
  });

  test('у даты пределов нет', () => {
    expect(shape(v.pipe(v.string(), v.isoDate()))).not.toHaveProperty('limits');
  });

  test.each([
    ['массив', v.array(v.string())],
    ['объект', v.object({ a: v.string() })],
    ['v.date()', v.date()],
  ])('неподдержанное (%s) — откат на string без броска', (_, entry) => {
    expect(() => shape(entry)).not.toThrow();
    expect(shape(entry).kind).toBe('string');
  });
});

describe('FieldDescription — пределы', () => {
  test('целое число с пределами', () => {
    const entry = v.pipe(
      v.number(),
      v.integer(),
      v.minValue(1),
      v.maxValue(99),
    );

    expect(shape(entry).limits).toStrictEqual({
      min: 1,
      max: 99,
      integer: true,
    });
  });

  test('число без целости и только с нижним пределом', () => {
    expect(shape(v.pipe(v.number(), v.minValue(0))).limits).toStrictEqual({
      min: 0,
    });
  });

  test('минимум и максимум нуль — пределы есть', () => {
    const entry = v.pipe(v.number(), v.minValue(0), v.maxValue(0));

    expect(shape(entry).limits).toStrictEqual({ min: 0, max: 0 });
  });

  test('minLength и maxLength строки', () => {
    const entry = v.pipe(v.string(), v.minLength(3), v.maxLength(10));

    expect(shape(entry).limits).toStrictEqual({ minLength: 3, maxLength: 10 });
  });

  test('length — и минимум, и максимум длины', () => {
    expect(shape(v.pipe(v.string(), v.length(5))).limits).toStrictEqual({
      minLength: 5,
      maxLength: 5,
    });
  });

  test('nonEmpty — minLength 1', () => {
    expect(shape(v.pipe(v.string(), v.nonEmpty())).limits).toStrictEqual({
      minLength: 1,
    });
  });

  test('без пределов — ключа limits нет', () => {
    expect(shape(v.string())).not.toHaveProperty('limits');
    expect(shape(v.number())).not.toHaveProperty('limits');
    expect(shape(v.boolean())).not.toHaveProperty('limits');
  });

  test('тексты ошибок pipe-действий на пределы не влияют', () => {
    const entry = v.pipe(
      v.number('Введите число'),
      v.minValue(1, 'Не меньше 1'),
    );

    expect(shape(entry).limits).toStrictEqual({ min: 1 });
  });
});

describe('FieldDescription — подсказка и пример', () => {
  test('fieldHint пишет метаданные под ключом FIELD_HINT_KEY', () => {
    expect(FIELD_HINT_KEY).toBe('hint');
    expect(v.getMetadata(v.pipe(v.string(), fieldHint('Совет')))).toEqual({
      [FIELD_HINT_KEY]: 'Совет',
    });
  });

  test.each([[''], ['   ']])(
    'fieldHint(%p): пустая подсказка — бросок',
    (text) => {
      expect(() => fieldHint(text)).toThrow('подсказка');
    },
  );

  test('hint — из fieldHint поля', () => {
    const entry = v.pipe(v.string(), fieldHint('Коротко: что нужно сделать'));

    expect(shape(entry).hint).toBe('Коротко: что нужно сделать');
  });

  test('hint с обёрнутой схемы необязательного поля', () => {
    const entry = v.optional(v.pipe(v.string(), fieldHint('Внутри')));

    expect(shape(entry).hint).toBe('Внутри');
  });

  test('hint с самого необязательного поля', () => {
    const entry = v.pipe(v.optional(v.string()), fieldHint('Снаружи'));

    expect(shape(entry).hint).toBe('Снаружи');
  });

  test('пример — первый скаляр v.examples: строка, число, булево', () => {
    expect(
      shape(v.pipe(v.string(), v.examples(['Хлеб', 'Молоко']))).example,
    ).toBe('Хлеб');
    expect(shape(v.pipe(v.number(), v.examples([2, 3]))).example).toBe(2);
    expect(shape(v.pipe(v.boolean(), v.examples([false]))).example).toBe(false);
  });

  test('без подсказки и примера — ключей hint и example нет', () => {
    const described = shape(v.pipe(v.string(), v.title('Имя')));

    expect(described).not.toHaveProperty('hint');
    expect(described).not.toHaveProperty('example');
  });

  test('метаданные не про подсказку не создают hint', () => {
    expect(
      shape(v.pipe(v.string(), v.metadata({ other: 'x' }))),
    ).not.toHaveProperty('hint');
  });
});

describe('FieldDescription — базовые поля dmg-core', () => {
  test('F.sensitive: вид строки, пример не отдаётся, подсказка остаётся', () => {
    const entry = v.pipe(
      F.sensitive(v.string()),
      v.examples(['secret@example.org']),
      fieldHint('Только для связи'),
    );

    const described = shape(entry);

    expect(described.kind).toBe('string');
    expect(described.hint).toBe('Только для связи');
    expect(described).not.toHaveProperty('example');
  });

  test('F.uuid: строка с подписью «Идентификатор …», пределов нет', () => {
    expect(shape(F.uuid('задачи'), 'taskId')).toStrictEqual({
      name: 'taskId',
      label: 'Идентификатор задачи',
      kind: 'string',
      optional: false,
    });
  });

  test('F.timestamp: целое число от нуля', () => {
    expect(shape(F.timestamp('создания'), 'at')).toStrictEqual({
      name: 'at',
      label: 'Время создания',
      kind: 'number',
      optional: false,
      limits: { min: 0, integer: true },
    });
  });

  test('F.expectedVersion: необязательное целое от нуля, подпись снаружи', () => {
    expect(shape(F.expectedVersion('задачи'), 'version')).toStrictEqual({
      name: 'version',
      label: 'Версия задачи, которую видел клиент',
      kind: 'number',
      optional: true,
      limits: { min: 0, integer: true },
    });
  });

  test('F.string: строка не короче одного знака', () => {
    expect(shape(F.string('Название'))).toMatchObject({
      kind: 'string',
      label: 'Название',
      limits: { minLength: 1 },
    });
  });

  test('F.boolean: boolean', () => {
    expect(shape(F.boolean('Готово')).kind).toBe('boolean');
  });
});

describe('FieldDescription — полное описание', () => {
  test('числовое поле: все части вместе', () => {
    const entry = v.pipe(
      v.number('Введите количество'),
      v.integer(),
      v.minValue(1, 'Не меньше одного'),
      v.maxValue(99, 'Не больше 99'),
      v.title('Количество'),
      v.examples([2]),
      fieldHint('Сколько штук, от одной'),
      v.description('Количество штук'),
    );

    expect(shape(entry, 'qty')).toStrictEqual({
      name: 'qty',
      label: 'Количество',
      kind: 'number',
      optional: false,
      hint: 'Сколько штук, от одной',
      example: 2,
      limits: { min: 1, max: 99, integer: true },
    });
  });
});
