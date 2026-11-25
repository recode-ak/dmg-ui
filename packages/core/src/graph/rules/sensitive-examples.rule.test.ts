import { describe, expect, test } from 'bun:test';
import { F } from 'dmg-core';
import { ExampleUiSetDef } from 'dmg-ui/example';
import * as v from 'valibot';
import { ExampleMenuStubUiAppDef } from '../../../testing/ui-app.fixture';
import { ArchReport, UiScene } from '../../../testing/ui-arch';
import { fieldHint } from '../../schema/field-hint';

const TEXTS = { label: 'Подпись', description: 'Описание.' };

/** Чувствительное поле с описанием, без примера. */
const secret = () => v.pipe(F.sensitive(v.string()), v.description('Секрет'));
/** То же, но с примером — нарушение. */
const exposed = () =>
  v.pipe(
    F.sensitive(v.string()),
    v.description('Секрет'),
    v.examples(['secret@example.org']),
  );

const run = (over: Parameters<typeof UiScene.screen>[1]) =>
  new UiScene({ screens: [UiScene.screen('a', over)] }).report();

describe('UI-26: у поля с F.sensitive нет examples', () => {
  test('нарушение: поле input действия', () => {
    const input = v.object({ pin: exposed() });

    const report = run({ actions: { go: { ...TEXTS, input } } });

    expect(report.code).toBe(1);
    expect(report.rule('UI-26')).toEqual([
      'UI-26: miniUi/todo/a/go: у поля pin схемы input с F.sensitive есть examples',
    ]);
  });

  test('нарушение: поле params', () => {
    const params = v.strictObject({ pin: exposed() });

    expect(run({ params }).rule('UI-26')).toEqual([
      'UI-26: miniUi/todo/a: у поля pin схемы params с F.sensitive есть examples',
    ]);
  });

  test('нарушение: поле state', () => {
    const state = v.strictObject({ pin: exposed() });

    expect(run({ state }).rule('UI-26')).toEqual([
      'UI-26: miniUi/todo/a: у поля pin схемы state с F.sensitive есть examples',
    ]);
  });

  test('нарушение: поле input локального действия', () => {
    const input = v.object({ pin: exposed() });

    expect(
      run({ locals: { pick: { ...TEXTS, input } } }).rule('UI-26'),
    ).toEqual([
      'UI-26: miniUi/todo/a: у поля pin схемы local.pick.input с F.sensitive есть examples',
    ]);
  });

  test('нарушение: поле data выхода', () => {
    const data = v.object({ pin: exposed() });

    expect(run({ exits: { done: { ...TEXTS, data } } }).rule('UI-26')).toEqual([
      'UI-26: miniUi/todo/a: у поля pin схемы exit.done.data с F.sensitive есть examples',
    ]);
  });

  test('нарушение: вложенное поле в v.object — путь через точку', () => {
    const filter = v.pipe(
      v.strictObject({ pin: exposed() }),
      v.description('Фильтр'),
    );
    const params = v.strictObject({ filter });

    expect(run({ params }).rule('UI-26')).toEqual([
      'UI-26: miniUi/todo/a: у поля filter.pin схемы params с F.sensitive есть examples',
    ]);
  });

  test('нарушение: элемент v.array — путь с []', () => {
    const params = v.strictObject({
      pins: v.pipe(v.array(exposed()), v.description('Секреты')),
    });

    expect(run({ params }).rule('UI-26')).toEqual([
      'UI-26: miniUi/todo/a: у поля pins[] схемы params с F.sensitive есть examples',
    ]);
  });

  test('без нарушения: F.sensitive без examples', () => {
    const params = v.strictObject({ pin: secret() });

    expect(run({ params }).rule('UI-26')).toEqual([]);
  });

  test('без нарушения: examples без F.sensitive', () => {
    const params = v.strictObject({
      title: v.pipe(
        v.string(),
        v.description('Название'),
        v.examples(['Купить хлеб']),
      ),
    });

    expect(run({ params }).rule('UI-26')).toEqual([]);
  });

  test('без нарушения: F.sensitive с hint — подсказка допустима', () => {
    const params = v.strictObject({
      pin: v.pipe(secret(), fieldHint('Только для связи')),
    });

    expect(run({ params }).rule('UI-26')).toEqual([]);
  });

  test('учебный набор: правило не срабатывает', () => {
    const report = ArchReport.of(
      UiScene.appOf(ExampleUiSetDef, [ExampleMenuStubUiAppDef]),
    );

    expect(report.rule('UI-26')).toEqual([]);
  });
});
