import { describe, expect, test } from 'bun:test';
import * as v from 'valibot';
import { SchemaCheck } from './schema-check';

describe('SchemaCheck', () => {
  test('замечание во вложенном поле — field — ключ первого уровня', () => {
    const check = new SchemaCheck(
      v.object({ owner: v.object({ name: v.string('Имя — строка') }) }),
    );

    expect(check.run({ owner: { name: 1 } })).toEqual({
      ok: false,
      error: [{ field: 'owner', text: 'Имя — строка' }],
    });
  });
});
