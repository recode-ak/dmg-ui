import { describe, expect, test } from 'bun:test';
import * as v from 'valibot';
import { UiScene } from '../../../testing/ui-arch';
import type { InputSchema, StrictSchema } from '../../manifest/screen-def';

const TEXTS = { label: 'Подпись', description: 'Описание.' };
const field = v.pipe(v.string(), v.description('Поле'));
const run = (over: Parameters<typeof UiScene.screen>[1]) =>
  new UiScene({ screens: [UiScene.screen('a', over)] }).report();

describe('UI-19: params и state строгие, input действия — объект', () => {
  test('нарушение: params — не strictObject', () => {
    const params = UiScene.bypass<StrictSchema>(v.object({ id: field }));

    const report = run({ params });

    expect(report.code).toBe(1);
    expect(report.rule('UI-19')).toEqual([
      'UI-19: экран miniUi/todo/a: схема params не строгая (strictObject)',
    ]);
  });

  test('нарушение: state — не strictObject', () => {
    const state = UiScene.bypass<StrictSchema>(v.object({ id: field }));

    expect(run({ state }).rule('UI-19')).toEqual([
      'UI-19: экран miniUi/todo/a: схема state не строгая (strictObject)',
    ]);
  });

  test('нарушение: input действия — не объект', () => {
    const input = UiScene.bypass<InputSchema>(v.string());

    const [line, ...rest] = run({ actions: { go: { ...TEXTS, input } } }).rule(
      'UI-19',
    );

    expect(rest).toEqual([]);
    expect(line).toStartWith('UI-19: ');
    expect(line).toContain('miniUi/todo/a/go');
  });

  test('без нарушения: input — нестрогий объект, params и state — strictObject', () => {
    const input = v.object({ id: field });

    const report = run({
      params: v.strictObject({ id: field }),
      state: v.strictObject({ id: field }),
      actions: { go: { ...TEXTS, input } },
    });

    expect(report.rule('UI-19')).toEqual([]);
  });
});
