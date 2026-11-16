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
});
