import { describe, expect, test } from 'bun:test';
import * as v from 'valibot';
import { fieldHint } from '../schema/field-hint';
import { ActionInput } from './action-input';

const input = new ActionInput(
  v.object(
    {
      title: v.pipe(
        v.string(),
        v.nonEmpty('Название не может быть пустым'),
        v.description('Название задачи'),
      ),
      note: v.optional(
        v.pipe(v.string('Комментарий — строка'), v.description('Комментарий')),
      ),
    },
    'Ожидался объект полей',
  ),
);

describe('ActionInput', () => {
  test('подпись необязательного поля — с самого поля или с обёрнутой схемы', () => {
    const both = new ActionInput(
      v.object({
        outer: v.pipe(v.optional(v.string()), v.description('Снаружи')),
        inner: v.optional(v.pipe(v.string(), v.description('Внутри'))),
        bare: v.optional(v.string()),
      }),
    );

    expect(both.fields()).toEqual([
      { name: 'outer', label: 'Снаружи', kind: 'string', optional: true },
      { name: 'inner', label: 'Внутри', kind: 'string', optional: true },
      { name: 'bare', label: 'bare', kind: 'string', optional: true },
    ]);
  });

  test('fields(): имя, подпись из v.description, вид и признак необязательного', () => {
    expect(input.fields()).toEqual([
      {
        name: 'title',
        label: 'Название задачи',
        kind: 'string',
        optional: false,
        limits: { minLength: 1 },
      },
      { name: 'note', label: 'Комментарий', kind: 'string', optional: true },
    ]);
  });

  test('вход по схеме — ok с выходом схемы', () => {
    expect(input.check({ title: 'Хлеб' })).toEqual({
      ok: true,
      value: { title: 'Хлеб' },
    });
  });

  test('поле не по схеме — issue с полем и текстом схемы', () => {
    expect(input.check({ title: '' })).toEqual({
      ok: false,
      error: {
        issues: [{ field: 'title', text: 'Название не может быть пустым' }],
      },
    });
  });

  test('два поля не по схеме — два issue', () => {
    expect(input.check({ title: '', note: 1 })).toEqual({
      ok: false,
      error: {
        issues: [
          { field: 'title', text: 'Название не может быть пустым' },
          { field: 'note', text: 'Комментарий — строка' },
        ],
      },
    });
  });

  test('не объект — issue без поля', () => {
    expect(input.check(42)).toEqual({
      ok: false,
      error: { issues: [{ text: 'Ожидался объект полей' }] },
    });
  });
});

describe('ActionInput.fields — вид, подсказка, пределы', () => {
  test('поле с видом, подсказкой, примером и пределами — из схемы', () => {
    const qty = new ActionInput(
      v.object({
        qty: v.pipe(
          v.number('Введите количество'),
          v.integer(),
          v.minValue(1),
          v.maxValue(99),
          v.title('Количество'),
          v.examples([2]),
          fieldHint('Сколько штук, от одной'),
        ),
      }),
    );

    expect(qty.fields()).toStrictEqual([
      {
        name: 'qty',
        label: 'Количество',
        kind: 'number',
        optional: false,
        hint: 'Сколько штук, от одной',
        example: 2,
        limits: { min: 1, max: 99, integer: true },
      },
    ]);
  });

  test('булево поле — неявные варианты Да и Нет, вид остаётся boolean', () => {
    const flags = new ActionInput(v.object({ done: v.boolean() }));

    expect(flags.fields()).toStrictEqual([
      {
        name: 'done',
        label: 'done',
        kind: 'boolean',
        optional: false,
        choices: [
          { value: true, label: 'Да' },
          { value: false, label: 'Нет' },
        ],
      },
    ]);
  });

  test('picklist — варианты из options, value равен label; options в поле нет', () => {
    const picks = new ActionInput(
      v.object({ level: v.picklist(['low', 'high']) }),
    );

    const [field] = picks.fields();

    expect(field).toStrictEqual({
      name: 'level',
      label: 'level',
      kind: 'choice',
      optional: false,
      choices: [
        { value: 'low', label: 'low' },
        { value: 'high', label: 'high' },
      ],
    });
  });

  test('необязательное булево поле — те же варианты, optional true', () => {
    const flags = new ActionInput(v.object({ done: v.optional(v.boolean()) }));

    expect(flags.fields()[0]).toMatchObject({
      kind: 'boolean',
      optional: true,
      choices: [
        { value: true, label: 'Да' },
        { value: false, label: 'Нет' },
      ],
    });
  });

  test('подпись: title раньше description; у полей без подсказки ключа hint нет', () => {
    const titled = new ActionInput(
      v.object({
        a: v.pipe(v.string(), v.description('Описание'), v.title('Заголовок')),
      }),
    );

    const [field] = titled.fields();

    expect(field?.label).toBe('Заголовок');
    expect(field).not.toHaveProperty('hint');
    expect(field).not.toHaveProperty('example');
    expect(field).not.toHaveProperty('limits');
  });
});
