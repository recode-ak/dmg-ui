import { describe, expect, test } from 'bun:test';
import { HotkeyPress } from './hotkey-press';
import type { KeyFacts } from './hotkey-press.types';

// Решение по нажатию клавиши на странице: «/» вне поля ввода — перейти к полю
// основной формы (вернуть клавишу); иначе — `undefined`, нажатие остаётся
// браузеру и полю. Физическая клавиша `Slash` без Shift срабатывает и в
// русской раскладке, где на ней «.».

/** Нажатие «/» без модификаторов вне поля ввода; поля поверх — `over`. */
const press = (over: Partial<KeyFacts> = {}): KeyFacts => ({
  key: '/',
  code: 'Slash',
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  editable: false,
  composing: false,
  defaultPrevented: false,
  ...over,
});

describe('HotkeyPress.key — клавиша страницы', () => {
  test('«/» вне поля ввода — «/»', () => {
    expect(HotkeyPress.key(press())).toBe('/');
  });

  test('русская раскладка: физическая Slash с «.» — «/»', () => {
    expect(HotkeyPress.key(press({ key: '.' }))).toBe('/');
  });

  test('«/» через Shift (другая раскладка) — «/»', () => {
    expect(HotkeyPress.key(press({ code: 'Digit7', shiftKey: true }))).toBe(
      '/',
    );
  });
});

describe('HotkeyPress.key — оставить браузеру и полю', () => {
  const cases: [string, Partial<KeyFacts>][] = [
    ['в поле ввода', { editable: true }],
    ['набор иероглифов (IME)', { composing: true }],
    ['уже отменённое событие', { defaultPrevented: true }],
    ['Ctrl', { ctrlKey: true }],
    ['Cmd', { metaKey: true }],
    ['Alt', { altKey: true }],
    ['Shift+Slash — «?» или «,»', { key: '?', shiftKey: true }],
    ['другая клавиша', { key: 'a', code: 'KeyA' }],
  ];

  for (const [name, over] of cases) {
    test(`${name} — undefined`, () => {
      expect(HotkeyPress.key(press(over))).toBeUndefined();
    });
  }
});
