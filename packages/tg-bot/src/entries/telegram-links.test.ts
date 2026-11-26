import { describe, expect, test } from 'bun:test';
import { TelegramLinks } from './telegram-links';

// Формат ссылки Telegram (D-UI-127): `https://t.me/<username>?start=<код>`.
// `username` приходит из `getMe` проекта; сборка проверяет его по
// `^[A-Za-z0-9_]{5,32}$` — неверный даёт бросок сборки, а не битую ссылку.

const CODE = 'Su8M0DgYIazvS95XXO5VAG';

describe('TelegramLinks.url', () => {
  test('ссылка: https://t.me/<username>?start=<код>', () => {
    const url = TelegramLinks.url('example_bot');

    expect(url(CODE)).toBe(`https://t.me/example_bot?start=${CODE}`);
  });

  test('один url на сборку: коды подставляются каждый свой', () => {
    const url = TelegramLinks.url('example_bot');
    const other = 'a'.repeat(22);

    expect(url(other)).toBe(`https://t.me/example_bot?start=${other}`);
    expect(url(CODE)).not.toBe(url(other));
  });

  test.each([
    ['5 знаков (нижняя граница)', 'abcde'],
    ['32 знака (верхняя граница)', 'a'.repeat(32)],
    ['с цифрами и «_»', 'Bot_2026_x'],
    ['в верхнем регистре', 'EXAMPLE_BOT'],
  ])('username %s — годится', (_, username) => {
    expect(TelegramLinks.url(username)(CODE)).toBe(
      `https://t.me/${username}?start=${CODE}`,
    );
  });

  test.each([
    ['пустая строка', ''],
    ['4 знака', 'abcd'],
    ['33 знака', 'a'.repeat(33)],
    ['с «@»', '@example_bot'],
    ['с дефисом', 'example-bot'],
    ['с точкой', 'example.bot'],
    ['с пробелом', 'example bot'],
    ['с «/» — подмена пути ссылки', 'example/bot'],
    ['с «?» — подмена параметров', 'example_bot?x=1'],
    ['с «#»', 'example_bot#x'],
    ['кириллица', 'пример_бота'],
    ['с переводом строки', 'example_bot\n'],
  ])('username %s — бросок сборки', (_, username) => {
    expect(() => TelegramLinks.url(username)).toThrow();
  });
});
