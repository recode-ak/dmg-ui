import { describe, expect, test } from 'bun:test';
import { TelegramKeyboard } from './telegram-keyboard';

// Инлайн-клавиатура из вариантов сообщения: по кнопке в строке, `text` —
// подпись как есть, `callback_data` — ссылка беседы как есть.

describe('TelegramKeyboard', () => {
  test('по кнопке в строке, в порядке вариантов: text — подпись, callback_data — ссылка', () => {
    expect(
      TelegramKeyboard.of([
        { ref: 'a1', label: 'Создать задачу' },
        { ref: 'b2', label: 'Закрыть' },
        { ref: 'c3', label: 'Назад' },
      ]),
    ).toEqual({
      inline_keyboard: [
        [{ text: 'Создать задачу', callback_data: 'a1' }],
        [{ text: 'Закрыть', callback_data: 'b2' }],
        [{ text: 'Назад', callback_data: 'c3' }],
      ],
    });
  });

  test('подпись со знаками разметки и составными символами — как есть', () => {
    const label = '*Хлеб* [купить] \u{1F44D}\u{1F3FD} <b>';

    expect(TelegramKeyboard.of([{ ref: 'r1', label }])).toEqual({
      inline_keyboard: [[{ text: label, callback_data: 'r1' }]],
    });
  });

  test('без вариантов — пустая клавиатура', () => {
    expect(TelegramKeyboard.of([])).toEqual({ inline_keyboard: [] });
  });
});
