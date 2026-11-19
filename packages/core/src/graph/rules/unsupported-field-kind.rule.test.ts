import { describe, expect, test } from 'bun:test';
import * as v from 'valibot';
import { ExampleUiSetDef } from '../../../testing/example';
import { ExampleMenuStubAppDef } from '../../../testing/ui-app-fixture';
import { ArchReport, UiScene } from '../../../testing/ui-arch';

const TEXTS = { label: 'Подпись', description: 'Описание.' };
const described = <S extends v.GenericSchema>(schema: S) =>
  v.pipe(schema, v.description('Поле'));
const KINDS = '(string, number, boolean, date, choice)';

const run = (over: Parameters<typeof UiScene.screen>[1]) =>
  new UiScene({ screens: [UiScene.screen('a', over)] }).report();
const viaAction = (shape: Record<string, v.GenericSchema>) =>
  run({ actions: { go: { ...TEXTS, input: v.object(shape) } } });

describe('UI-27: вид поля входа поддержан вводом человека', () => {
  test('нарушение: массив в input действия', () => {
    const report = viaAction({ tags: described(v.array(v.string())) });

    expect(report.code).toBe(1);
    expect(report.rule('UI-27')).toEqual([
      `UI-27: miniUi/todo/a/go: поле tags схемы input имеет вид array, которого нет у ввода человека ${KINDS}`,
    ]);
  });

  test('нарушение: объект в input действия', () => {
    const report = viaAction({
      filter: described(v.object({ name: described(v.string()) })),
    });

    expect(report.rule('UI-27')).toEqual([
      `UI-27: miniUi/todo/a/go: поле filter схемы input имеет вид object, которого нет у ввода человека ${KINDS}`,
    ]);
  });

  test('нарушение: массив в input локального действия', () => {
    const input = v.object({ tags: described(v.array(v.string())) });

    expect(
      run({ locals: { pick: { ...TEXTS, input } } }).rule('UI-27'),
    ).toEqual([
      `UI-27: miniUi/todo/a: поле tags схемы local.pick.input имеет вид array, которого нет у ввода человека ${KINDS}`,
    ]);
  });

  test('нарушение: объект в input локального действия', () => {
    const input = v.object({
      filter: described(v.object({ name: described(v.string()) })),
    });

    expect(
      run({ locals: { pick: { ...TEXTS, input } } }).rule('UI-27'),
    ).toEqual([
      `UI-27: miniUi/todo/a: поле filter схемы local.pick.input имеет вид object, которого нет у ввода человека ${KINDS}`,
    ]);
  });

  test('нарушение: несколько полей — по строке на поле, в порядке полей', () => {
    const report = viaAction({
      tags: described(v.array(v.string())),
      title: described(v.string()),
      filter: described(v.object({})),
    });

    expect(report.rule('UI-27')).toEqual([
      `UI-27: miniUi/todo/a/go: поле tags схемы input имеет вид array, которого нет у ввода человека ${KINDS}`,
      `UI-27: miniUi/todo/a/go: поле filter схемы input имеет вид object, которого нет у ввода человека ${KINDS}`,
    ]);
  });

  test('нарушение: необязательный массив — вид тот же', () => {
    const report = viaAction({
      tags: described(v.optional(v.array(v.string()))),
    });

    expect(report.rule('UI-27')).toEqual([
      `UI-27: miniUi/todo/a/go: поле tags схемы input имеет вид array, которого нет у ввода человека ${KINDS}`,
    ]);
  });

  test('без нарушения: число, булево, выбор, ISO-дата, union из литералов, optional(string)', () => {
    const report = viaAction({
      count: described(v.number()),
      done: described(v.boolean()),
      level: described(v.picklist(['low', 'high'])),
      day: described(v.pipe(v.string(), v.isoDate())),
      mode: described(v.union([v.literal('a'), v.literal('b')])),
      note: described(v.optional(v.string())),
    });

    expect(report.rule('UI-27')).toEqual([]);
  });

  test('без нарушения: массив в params, state и data выхода', () => {
    const rows = described(v.array(v.string()));
    const report = run({
      params: v.strictObject({ rows }),
      state: v.strictObject({ rows }),
      exits: { done: { ...TEXTS, data: v.object({ rows }) } },
    });

    expect(report.rule('UI-27')).toEqual([]);
  });

  test('без нарушения: массив внутри чужого узла не разбирается — только верхний уровень', () => {
    const report = viaAction({ count: described(v.number()) });

    expect(report.rule('UI-27')).toEqual([]);
  });

  test('учебный набор: правило не срабатывает', () => {
    const report = ArchReport.of(
      UiScene.appOf(ExampleUiSetDef, [ExampleMenuStubAppDef]),
    );

    expect(report.rule('UI-27')).toEqual([]);
  });
});
