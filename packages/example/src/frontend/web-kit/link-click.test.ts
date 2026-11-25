import { describe, expect, test } from 'bun:test';
import { LinkClick } from './link-click';

// Решение по щелчку на ссылке внутри страницы: путь с запросом — переход
// внутри страницы (отменить действие браузера, вызвать `route`); `undefined` —
// оставить браузеру: средняя кнопка и модификаторы (новая вкладка, окно),
// чужой источник, не `http(s)`, якорь, уже отменённое событие.

const ORIGIN = 'http://localhost:4310';

type Facts = Parameters<typeof LinkClick.target>[0];

/** Щелчок левой кнопкой по ссылке без модификаторов; поля поверх — `over`. */
const click = (over: Partial<Facts> = {}): Facts => ({
  href: '/assigned',
  button: 0,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  defaultPrevented: false,
  target: undefined,
  download: false,
  ...over,
});

const target = (over: Partial<Facts> = {}) =>
  LinkClick.target(click(over), ORIGIN);

describe('LinkClick.target — переход внутри страницы', () => {
  test('левая кнопка по /assigned — путь /assigned', () => {
    expect(target()).toBe('/assigned');
  });

  test('корень — /', () => {
    expect(target({ href: '/' })).toBe('/');
  });

  test('путь с запросом сохраняет запрос', () => {
    expect(target({ href: '/?page=1' })).toBe('/?page=1');
  });

  test('абсолютная ссылка того же источника — путь и запрос', () => {
    expect(target({ href: `${ORIGIN}/assigned?x=1` })).toBe('/assigned?x=1');
  });

  test('target="_self" — как без target', () => {
    expect(target({ target: '_self' })).toBe('/assigned');
  });

  test('пустой target — как без target', () => {
    expect(target({ target: '' })).toBe('/assigned');
  });
});

describe('LinkClick.target — оставить браузеру', () => {
  const browser: [string, Partial<Facts>][] = [
    ['средняя кнопка', { button: 1 }],
    ['правая кнопка', { button: 2 }],
    ['Ctrl', { ctrlKey: true }],
    ['Meta (Cmd)', { metaKey: true }],
    ['Shift', { shiftKey: true }],
    ['Alt', { altKey: true }],
    ['target="_blank"', { target: '_blank' }],
    ['target="_top"', { target: '_top' }],
    ['target — имя окна', { target: 'other' }],
    ['download', { download: true }],
    ['событие уже отменено', { defaultPrevented: true }],
    ['чужой источник', { href: 'http://evil.example/assigned' }],
    ['тот же хост, другой порт', { href: 'http://localhost:1/assigned' }],
    ['другой хост того же порта', { href: 'http://127.0.0.1:4310/assigned' }],
    ['чужой источник без схемы (//хост/путь)', { href: '//evil.example/x' }],
    ['javascript:', { href: 'javascript:alert(1)' }],
    ['mailto:', { href: 'mailto:a@example.com' }],
    ['data:', { href: 'data:text/html,x' }],
    ['ftp:', { href: 'ftp://localhost/x' }],
    ['якорь', { href: '#top' }],
    ['пустой href', { href: '' }],
    ['нет href', { href: undefined }],
  ];

  for (const [name, over] of browser) {
    test(`${name} — undefined`, () => {
      expect(target(over)).toBeUndefined();
    });
  }
});
