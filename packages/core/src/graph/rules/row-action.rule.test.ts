import { describe, expect, test } from 'bun:test';
import { ExampleUiSetDef } from 'dmg-ui/example';
import * as v from 'valibot';
import { UiScene } from '../../../testing/ui-arch';
import type { ActionSpec, RowSpec } from '../../manifest/screen-def';
import { RowActionRule } from './row-action.rule';

// UI-38 (D-UI-129): по ветке — одно нарушение с узлом действия и тем, что
// нарушено (путь, ключ, подпись, другое действие); тексты — в rules.md.

const RULE = new RowActionRule(ExampleUiSetDef).id;
const ACTION = 'miniUi/todo/a/open';
const TEXTS = { label: 'Открыть', description: 'Открывает строку списка.' };

const described = <S extends v.GenericSchema>(schema: S) =>
  v.pipe(schema, v.description('Поле'));

/** Действие строки с одним полем входа, если `input` не задан иначе. */
const rowAction = (
  row: RowSpec,
  input: v.GenericSchema = v.object({ taskId: described(v.string()) }),
): ActionSpec => ({ ...TEXTS, input: input as ActionSpec['input'], row });

const ROW = { list: 'tasks', key: 'uuid', label: 'title' };

const TASK = v.object({
  uuid: described(v.string()),
  title: described(v.string()),
});

/** Экран `a` с данными `data` и действиями `actions`; нарушения правила строки. */
const violations = (
  data: Record<string, v.GenericSchema>,
  actions: Record<string, ActionSpec>,
) =>
  new UiScene({
    screens: [UiScene.screen('a', { data: v.object(data), actions })],
  })
    .report()
    .rule(RULE);

/** Нарушения одного действия строки `open` над данными `data`. */
const violationsOf = (
  data: Record<string, v.GenericSchema>,
  row: RowSpec = ROW,
  input?: v.GenericSchema,
) => violations(data, { open: rowAction(row, input) });

describe('правило строки: форма действия строки', () => {
  test('без нарушений: список объектов с ключом и строковой подписью, один вход', () => {
    expect(violationsOf({ tasks: v.array(TASK) })).toEqual([]);
  });

  test('без нарушений: список по вложенному пути через необязательного родителя', () => {
    const data = {
      course: v.optional(v.object({ moduleRows: v.array(TASK) })),
    };

    expect(
      violationsOf(data, {
        list: 'course.moduleRows',
        key: 'uuid',
        label: 'title',
      }),
    ).toEqual([]);
  });

  test('без нарушений: действия строки на разных списках экрана', () => {
    const data = { tasks: v.array(TASK), notes: v.array(TASK) };

    expect(
      violations(data, {
        open: rowAction(ROW),
        peek: rowAction({ ...ROW, list: 'notes' }),
      }),
    ).toEqual([]);
  });

  test('нарушение: путь list не ведёт ни к какому полю данных', () => {
    const found = violationsOf(
      { tasks: v.array(TASK) },
      {
        ...ROW,
        list: 'missing',
      },
    );

    expect(found).toHaveLength(1);
    expect(found[0]).toContain(ACTION);
    expect(found[0]).toContain('missing');
  });

  test('нарушение: list ведёт не к массиву', () => {
    const found = violationsOf({ tasks: described(v.string()) });

    expect(found).toHaveLength(1);
    expect(found[0]).toContain(ACTION);
    expect(found[0]).toContain('tasks');
  });

  test('нарушение: элемент списка — не объект', () => {
    const found = violationsOf({ tasks: v.array(described(v.string())) });

    expect(found).toHaveLength(1);
    expect(found[0]).toContain(ACTION);
    expect(found[0]).toContain('tasks');
  });

  test('нарушение: элемент списка — anyOf (union объектов)', () => {
    const other = v.object({
      uuid: described(v.string()),
      title: described(v.string()),
      extra: described(v.string()),
    });

    const found = violationsOf({ tasks: v.array(v.union([TASK, other])) });

    expect(found).toHaveLength(1);
    expect(found[0]).toContain(ACTION);
    expect(found[0]).toContain('tasks');
  });

  test('нарушение: у элемента нет поля key', () => {
    const found = violationsOf(
      { tasks: v.array(v.object({ title: described(v.string()) })) },
      ROW,
    );

    expect(found).toHaveLength(1);
    expect(found[0]).toContain(ACTION);
    expect(found[0]).toContain('uuid');
  });

  test('нарушение: поле key элемента — не строка, число или булево', () => {
    const found = violationsOf({
      tasks: v.array(
        v.object({
          uuid: described(v.object({})),
          title: described(v.string()),
        }),
      ),
    });

    expect(found).toHaveLength(1);
    expect(found[0]).toContain(ACTION);
    expect(found[0]).toContain('uuid');
  });

  test('нарушение: действие строки — основное действие экрана', () => {
    const found = new UiScene({
      screens: [
        UiScene.screen('a', {
          data: v.object({ tasks: v.array(TASK) }),
          actions: { open: rowAction(ROW) },
          primary: 'open',
        }),
      ],
    })
      .report()
      .rule(RULE);

    expect(found).toHaveLength(1);
    expect(found[0]).toContain(ACTION);
  });

  test('нарушение: поле label элемента — не строка', () => {
    const found = violationsOf({
      tasks: v.array(
        v.object({
          uuid: described(v.string()),
          title: described(v.number()),
        }),
      ),
    });

    expect(found).toHaveLength(1);
    expect(found[0]).toContain(ACTION);
    expect(found[0]).toContain('title');
  });

  test('нарушение: у input два поля', () => {
    const found = violationsOf(
      { tasks: v.array(TASK) },
      ROW,
      v.object({ taskId: described(v.string()), note: described(v.string()) }),
    );

    expect(found).toHaveLength(1);
    expect(found[0]).toContain(ACTION);
  });

  test('нарушение: два действия строки на одном списке', () => {
    const found = violations(
      { tasks: v.array(TASK) },
      { open: rowAction(ROW), drop: rowAction(ROW) },
    );

    expect(found).toHaveLength(1);
    expect(found[0]).toContain('open');
    expect(found[0]).toContain('drop');
    expect(found[0]).toContain('tasks');
  });
});
