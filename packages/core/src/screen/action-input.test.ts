import { describe, expect, test } from 'bun:test';
import * as v from 'valibot';
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
  test('fields(): имя, подпись из v.description и признак необязательного', () => {
    expect(input.fields()).toEqual([
      { name: 'title', label: 'Название задачи', optional: false },
      { name: 'note', label: 'Комментарий', optional: true },
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
