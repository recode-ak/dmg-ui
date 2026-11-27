import { describe, expect, test } from 'bun:test';
import { toJsonSchema } from 'dmg-core';
import * as v from 'valibot';
import { JsonSchemaView } from './json-schema-view';

const view = (schema: v.GenericSchema) =>
  new JsonSchemaView(toJsonSchema(schema) as Record<string, unknown>);

describe('JsonSchemaView.commonFields: поля, которые есть у любого значения схемы', () => {
  test('объект — его поля первого уровня', () => {
    const fields = view(v.object({ userId: v.string(), courseId: v.string() }));

    expect(fields.commonFields()).toEqual(['userId', 'courseId']);
  });

  test('вариант — поля, общие для всех веток', () => {
    const fields = view(
      v.variant('kind', [
        v.object({
          kind: v.literal('course'),
          userId: v.string(),
          courseId: v.string(),
        }),
        v.object({
          kind: v.literal('module'),
          userId: v.string(),
          moduleId: v.string(),
        }),
      ]),
    );

    expect(fields.commonFields()).toEqual(['kind', 'userId']);
  });
});
