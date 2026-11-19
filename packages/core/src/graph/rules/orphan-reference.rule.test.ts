import { describe, expect, test } from 'bun:test';
import { CoreErrors, DomainRuleDef, ErrorDef, ok } from 'dmg-core';
import { TaskErrors, TaskRules } from 'dmg-core/testing/example';
import { UiScene } from '../../../testing/ui-arch';

const OutErrors = ErrorDef.define('OUT', {
  GONE: { kind: 'not_found', label: 'Нет', description: 'Объекта нет.' },
});
const run = (over: Parameters<typeof UiScene.screen>[1]) =>
  new UiScene({ screens: [UiScene.screen('a', over)] }).report();

describe('UI-22: ссылки только на Def набора UI и домена', () => {
  test('нарушение: действие ведёт на экран вне набора', () => {
    const ghost = UiScene.screen('ghost');

    const report = run({ actions: { go: UiScene.jump(ghost) } });

    expect(report.code).toBe(1);
    expect(report.rule('UI-22')).toEqual([
      'UI-22: miniUi/todo/a/go ссылается на screen «ghost» вне набора UI и домена',
    ]);
  });

  test('нарушение: экран перехватывает ошибку вне домена', () => {
    const report = run({ catches: [OutErrors.GONE] });

    expect(report.rule('UI-22')).toEqual([
      'UI-22: miniUi/todo/a ссылается на error «OUT_GONE» вне набора UI и домена',
    ]);
  });

  test('без нарушения: UC домена и базовая ошибка пакета — не внешние Def', () => {
    const report = run({ catches: [CoreErrors.UNAUTHORIZED] });

    expect(report.rule('UI-22')).toEqual([]);
  });

  test('нарушение: сторис требует правило, которого не проверяет ни один UC', () => {
    const stray = DomainRuleDef.define({
      name: 'stray',
      label: 'Ничейное правило',
      description: 'Правило, на которое не ссылается ни один UC.',
      error: TaskErrors.TOO_MANY_OPEN,
      check: () => ok(),
    });
    const a = UiScene.screen('a');
    const story = UiScene.story('s', [a], { rules: [stray] });

    const report = new UiScene({ screens: [a], stories: [story] }).report();

    expect(report.rule('UI-22')).toEqual([
      'UI-22: сторис miniUi/todo/s требует правило «stray», которого нет в графе: его не проверяет ни один UC',
    ]);
  });

  test('без нарушения: правило сторис проверяет UC домена', () => {
    const a = UiScene.screen('a');
    const story = UiScene.story('s', [a], {
      rules: [TaskRules.rules.withinOpenLimit],
    });

    const report = new UiScene({ screens: [a], stories: [story] }).report();

    expect(report.rule('UI-22')).toEqual([]);
  });

  test('нарушение: связь ведёт на сторис вне набора', () => {
    const [a, b] = [UiScene.screen('a'), UiScene.screen('b')];
    const ghost = UiScene.story('ghost', [b]);
    const story = UiScene.story('s', [a], { leads: () => [ghost] });

    const report = new UiScene({ screens: [a], stories: [story] }).report();

    expect(report.rule('UI-22')).toContain(
      'UI-22: miniUi/todo/s ссылается на story «ghost» вне набора UI и домена',
    );
  });
});
