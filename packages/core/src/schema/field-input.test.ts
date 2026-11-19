import { describe, expect, test } from 'bun:test';
import type { FieldKind, FieldLimits } from './field-description.types';
import { FieldInput } from './field-input';

// Приведение сырой строки канала к значению по виду поля и текст пределов.
// Схему не знает: отвергает не приведённое схема поля своим текстом ошибки.

const inputOf = (kind: FieldKind, limits?: FieldLimits) =>
  new FieldInput(limits === undefined ? { kind } : { kind, limits });

describe('FieldInput.value — число', () => {
  const number = inputOf('number');

  test.each([
    ['3', 3],
    ['0', 0],
    ['3.5', 3.5],
    ['-1', -1],
    ['+5', 5],
    ['-0.25', -0.25],
    ['  42  ', 42],
  ])('«%s» — число %p', (raw, expected) => {
    expect(number.value(raw)).toBe(expected);
  });

  test.each([
    ['abc'],
    [''],
    ['   '],
    ['1e3'],
    ['0x10'],
    ['1,5'],
    ['3.'],
    ['.5'],
    ['1 2'],
    ['--1'],
    ['Infinity'],
    ['NaN'],
  ])('«%s» остаётся строкой как есть — отвергнет схема', (raw) => {
    expect(number.value(raw)).toBe(raw);
  });
});

describe('FieldInput.value — остальные виды', () => {
  test.each<FieldKind>(['string', 'boolean', 'date', 'choice'])(
    '%s: строка остаётся строкой, в том числе похожая на число',
    (kind) => {
      const input = inputOf(kind);

      expect(input.value('3')).toBe('3');
      expect(input.value('true')).toBe('true');
      expect(input.value('2026-11-19')).toBe('2026-11-19');
      expect(input.value('')).toBe('');
    },
  );

  test('строка не обрезается пробелами', () => {
    expect(inputOf('string').value('  хлеб ')).toBe('  хлеб ');
  });
});

describe('FieldInput.limitsText', () => {
  test('от и до, целое', () => {
    expect(
      inputOf('number', { min: 1, max: 99, integer: true }).limitsText(),
    ).toBe('от 1 до 99, целое');
  });

  test('только нижний предел', () => {
    expect(inputOf('number', { min: 1 }).limitsText()).toBe('от 1');
  });

  test('только верхний предел', () => {
    expect(inputOf('number', { max: 99 }).limitsText()).toBe('до 99');
  });

  test('нижний предел нуль — не пропадает', () => {
    expect(inputOf('number', { min: 0, integer: true }).limitsText()).toBe(
      'от 0, целое',
    );
  });

  test('только целое', () => {
    expect(inputOf('number', { integer: true }).limitsText()).toBe('целое');
  });

  test('длина строки: от и до', () => {
    expect(
      inputOf('string', { minLength: 1, maxLength: 100 }).limitsText(),
    ).toBe('от 1 до 100 символов');
  });

  test('длина строки: только нижний предел', () => {
    expect(inputOf('string', { minLength: 3 }).limitsText()).toBe(
      'не короче 3 символов',
    );
  });

  test('длина строки: только верхний предел', () => {
    expect(inputOf('string', { maxLength: 100 }).limitsText()).toBe(
      'не длиннее 100 символов',
    );
  });

  test('длина строки: точная длина', () => {
    expect(inputOf('string', { minLength: 5, maxLength: 5 }).limitsText()).toBe(
      'ровно 5 символов',
    );
  });

  test('без пределов — undefined', () => {
    expect(inputOf('number').limitsText()).toBeUndefined();
    expect(inputOf('string').limitsText()).toBeUndefined();
    expect(inputOf('choice').limitsText()).toBeUndefined();
  });
});
