import { describe, expect, test } from 'bun:test';
import { CoreErrors, ErrorDef } from 'dmg-core';
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
});
