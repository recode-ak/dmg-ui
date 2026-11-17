import { describe, expect, test } from 'bun:test';
import type { FormattedText } from './message.types';
import { PlainText } from './plain-text';

// Видимый текст сообщения: то, что прочтёт собеседник. По нему меряют длину
// и пишут журнал подставных мессенджеров.

describe('PlainText', () => {
  test('сцепка текстов фрагментов: стили не оставляют следа, переводы строк — как есть', () => {
    const text: FormattedText = [
      { text: 'Купить ', styles: [] },
      { text: 'хлеб', styles: ['bold', 'italic'] },
      { text: '\n', styles: [] },
      { text: 'x = 1', styles: ['codeBlock'] },
      { text: '\nи *молоко*', styles: ['quote'] },
    ];

    expect(PlainText.of(text)).toBe('Купить хлеб\nx = 1\nи *молоко*');
  });

  test('у ссылки — подпись, без адреса', () => {
    const text: FormattedText = [
      { text: 'см. ', styles: [] },
      { text: 'справку', styles: ['bold'], link: 'https://example.org/help' },
    ];

    expect(PlainText.of(text)).toBe('см. справку');
  });

  test('пустой текст — пустая строка', () => {
    expect(PlainText.of([])).toBe('');
  });

  test('у момента — запасной текст: дата не вычисляется, момент не виден', () => {
    const text: FormattedText = [
      { text: 'срок ', styles: [] },
      {
        text: '18 ноября, 18:00',
        styles: ['bold'],
        moment: { at: 1_800_000_000, show: 'dateTime' },
      },
    ];

    expect(PlainText.of(text)).toBe('срок 18 ноября, 18:00');
  });
});
