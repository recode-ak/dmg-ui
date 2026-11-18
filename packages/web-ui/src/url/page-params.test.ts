import { describe, expect, test } from 'bun:test';
import { F } from 'dmg-core';
import { ListTasksUcDef } from 'dmg-core/testing/example';
import { ScreenDef, type StrictSchema } from 'dmg-ui';
import * as v from 'valibot';
import { PageParams } from './page-params';

// Небросающий вход параметров экрана (D-UI-77): `read(id, schema)` берёт JSON
// Schema параметров записью и отдаёт `Result` — вид параметров или все
// замечания по порядку полей; `of(id, def)` — обёртка, которая бросает первое.
// Таблицы видов и круг значений через кодек — `page-urls.test.ts`.

const KIND = 'нужна строка, целое или булево';
const ID = 'soloUi/solo/odd';

/** JSON Schema параметров с полями `properties`, как её отдаёт `toJsonSchema`. */
const schemaOf = (properties: Readonly<Record<string, unknown>>) => ({
  type: 'object',
  properties,
  additionalProperties: false,
});

const readable = (schema: Readonly<Record<string, unknown>>): PageParams => {
  const result = PageParams.read(ID, schema);
  if (!result.ok) throw new Error(`отказ read: ${result.error.join('; ')}`);
  return result.value;
};

describe('PageParams.read — вид параметров', () => {
  test('целое: имена и значение как раньше', () => {
    const params = readable(
      schemaOf({ page: { type: 'integer', minimum: 0 } }),
    );

    expect(params.names()).toEqual(['page']);
    expect(params.has('page')).toBe(true);
    expect(params.value('page', '5')).toEqual({ ok: true, value: 5 });
    expect(params.value('page', 'x')).toEqual({ ok: false, error: 'invalid' });
  });

  test('строка с форматом uuid: значение — строка', () => {
    const params = readable(
      schemaOf({ taskId: { type: 'string', format: 'uuid' } }),
    );

    expect(params.names()).toEqual(['taskId']);
    expect(params.value('taskId', 'abc')).toEqual({ ok: true, value: 'abc' });
  });

  test('строка из вариантов (enum с type)', () => {
    const params = readable(
      schemaOf({ status: { enum: ['open', 'done'], type: 'string' } }),
    );

    expect(params.value('status', 'open')).toEqual({ ok: true, value: 'open' });
  });

  test('булево: только true и false', () => {
    const params = readable(schemaOf({ flag: { type: 'boolean' } }));

    expect(params.value('flag', 'true')).toEqual({ ok: true, value: true });
    expect(params.value('flag', 'False')).toEqual({
      ok: false,
      error: 'invalid',
    });
  });

  test('необязательные поля (без required) — те же виды, имена в порядке схемы', () => {
    const params = readable({
      ...schemaOf({ b: { type: 'string' }, a: { type: 'integer' } }),
      required: [],
    });

    expect(params.names()).toEqual(['b', 'a']);
  });

  test('схема без properties и properties не запись — параметров нет, ok', () => {
    for (const schema of [
      {},
      { type: 'object' },
      { properties: 'x' },
      { properties: null },
      { properties: 5 },
      { properties: [{ type: 'string' }] },
    ]) {
      expect(readable(schema).names()).toEqual([]);
    }
  });
});

describe('PageParams.read — отказ: все замечания по порядку полей', () => {
  test('массив и anyOf — два замечания сразу, оба текста', () => {
    const result = PageParams.read(
      ID,
      schemaOf({
        a: { type: 'array', items: { type: 'string' } },
        b: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      }),
    );

    expect(result).toEqual({
      ok: false,
      error: [
        `параметр a экрана ${ID} не выражается в URL: ${KIND}`,
        `параметр b экрана ${ID} не выражается в URL: ${KIND}`,
      ],
    });
  });

  test('годное поле между плохими замечания не даёт, порядок — схемы', () => {
    const result = PageParams.read(
      ID,
      schemaOf({
        x: { type: 'number' },
        ok: { type: 'string' },
        y: { type: 'object' },
      }),
    );

    expect(result).toEqual({
      ok: false,
      error: [
        `параметр x экрана ${ID} не выражается в URL: ${KIND}`,
        `параметр y экрана ${ID} не выражается в URL: ${KIND}`,
      ],
    });
  });

  test('имя с _ — замечание об имени параметра', () => {
    expect(PageParams.read(ID, schemaOf({ _x: { type: 'string' } }))).toEqual({
      ok: false,
      error: [`имя параметра _x экрана ${ID} не выражается в URL`],
    });
  });

  test('константа без type и поле не объект — отказ вида', () => {
    expect(PageParams.read(ID, schemaOf({ x: { const: 'a' } }))).toEqual({
      ok: false,
      error: [`параметр x экрана ${ID} не выражается в URL: ${KIND}`],
    });
    expect(PageParams.read(ID, schemaOf({ x: true }))).toEqual({
      ok: false,
      error: [`параметр x экрана ${ID} не выражается в URL: ${KIND}`],
    });
  });

  test('поле null — замечание о виде, без броска', () => {
    expect(PageParams.read(ID, schemaOf({ x: null }))).toEqual({
      ok: false,
      error: [`параметр x экрана ${ID} не выражается в URL: ${KIND}`],
    });
  });

  test('плохое имя вместе с плохим видом — одно замечание об имени', () => {
    expect(PageParams.read(ID, schemaOf({ _y: { type: 'array' } }))).toEqual({
      ok: false,
      error: [`имя параметра _y экрана ${ID} не выражается в URL`],
    });
  });

  test('read не бросает на плохой схеме', () => {
    expect(() =>
      PageParams.read(ID, schemaOf({ _x: { type: 'array' }, y: 1 })),
    ).not.toThrow();
  });
});

describe('PageParams.of — обёртка: бросок первого замечания', () => {
  const screenOf = (params: StrictSchema) =>
    ScreenDef.define({
      name: 'odd',
      label: 'Проба',
      description: 'Экран с параметрами под проверку.',
      params,
      reads: [ListTasksUcDef],
      data: v.object({}),
    });

  const messageOf = (run: () => unknown): string | undefined => {
    try {
      run();
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
    return undefined;
  };

  test('массив в strictObject — бросок с PageUrls: и текстом замечания', () => {
    const def = screenOf(v.strictObject({ x: v.array(v.string()) }));

    expect(messageOf(() => PageParams.of(ID, def))).toBe(
      `PageUrls: параметр x экрана ${ID} не выражается в URL: ${KIND}`,
    );
  });

  test('два плохих поля — в броске только первое', () => {
    const def = screenOf(
      v.strictObject({
        x: v.array(v.string()),
        y: v.nullable(v.string()),
      }),
    );

    const message = messageOf(() => PageParams.of(ID, def));

    expect(message).toContain('параметр x экрана');
    expect(message).not.toContain('параметр y');
  });

  test('имя _x — бросок об имени параметра', () => {
    const def = screenOf(v.strictObject({ _x: v.string() }));

    expect(messageOf(() => PageParams.of(ID, def))).toBe(
      `PageUrls: имя параметра _x экрана ${ID} не выражается в URL`,
    );
  });

  test('непереводимая схема (дата) — прежний текст без поля', () => {
    const def = screenOf(v.strictObject({ d: v.date() }));

    expect(messageOf(() => PageParams.of(ID, def))).toBe(
      `PageUrls: параметры экрана ${ID} не выражаются в URL`,
    );
  });

  test('годная схема — те же параметры, что у read', () => {
    const def = screenOf(
      v.strictObject({
        status: v.picklist(['open', 'done']),
        flag: F.boolean('Флаг пробы'),
        q: v.optional(v.string()),
      }),
    );

    expect(PageParams.of(ID, def).names()).toEqual(['status', 'flag', 'q']);
  });
});
