import { describe, expect, test } from 'bun:test';
import * as v from 'valibot';
import { UiScene } from '../../../testing/ui-arch';

const TEXTS = { label: 'Подпись', description: 'Описание.' };
const described = <S extends v.GenericSchema>(schema: S, text: string) =>
  v.pipe(schema, v.description(text));

const run = (over: Parameters<typeof UiScene.screen>[1]) =>
  new UiScene({ screens: [UiScene.screen('a', over)] }).report();

describe('UI-14: у поля схемы UI есть description', () => {
  test('нарушение: поле params без description', () => {
    const report = run({ params: v.strictObject({ index: v.number() }) });

    expect(report.code).toBe(1);
    expect(report.rule('UI-14')).toEqual([
      'UI-14: miniUi/todo/a: поле index схемы params без description',
    ]);
  });

  test('нарушение: поле state без description', () => {
    const report = run({ state: v.strictObject({ picked: v.string() }) });

    expect(report.rule('UI-14')).toEqual([
      'UI-14: miniUi/todo/a: поле picked схемы state без description',
    ]);
  });

  test('нарушение: поле входа действия — на узле действия', () => {
    const input = v.object({ title: v.string() });

    const report = run({ actions: { go: { ...TEXTS, input } } });

    expect(report.rule('UI-14')).toEqual([
      'UI-14: miniUi/todo/a/go: поле title схемы input без description',
    ]);
  });

  test('нарушение: поле входа локального действия', () => {
    const input = v.object({ n: v.number() });

    const report = run({ locals: { pick: { ...TEXTS, input } } });

    expect(report.rule('UI-14')).toEqual([
      'UI-14: miniUi/todo/a: поле n схемы local.pick.input без description',
    ]);
  });

  test('нарушение: поле данных выхода', () => {
    const data = v.object({ code: v.string() });

    const report = run({ exits: { done: { ...TEXTS, data } } });

    expect(report.rule('UI-14')).toEqual([
      'UI-14: miniUi/todo/a: поле code схемы exit.done.data без description',
    ]);
  });

  test('нарушение: вложенное поле, путь через точку', () => {
    const filter = v.strictObject({ name: v.string() });
    const params = v.strictObject({ filter: described(filter, 'Фильтр') });

    expect(run({ params }).rule('UI-14')).toEqual([
      'UI-14: miniUi/todo/a: поле filter.name схемы params без description',
    ]);
  });

  test('без нарушения: все поля описаны, данные загрузки не проверяются', () => {
    const params = v.strictObject({ index: described(v.string(), 'Смещение') });

    const report = run({ params, data: v.object({ rows: v.string() }) });

    expect(report.rule('UI-14')).toEqual([]);
  });
});
