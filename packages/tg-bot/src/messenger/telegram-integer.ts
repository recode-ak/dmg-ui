import { NEGATIVE_INTEGER, POSITIVE_INTEGER } from './telegram.const';

/**
 * Разбор адреса Telegram из строки (D-UI-61): каноническое десятичное целое,
 * безопасное для JS, нужного знака; иначе `undefined`. Единый разбор для
 * мессенджера (собеседник, `message_id`: `positive`) и сообщества (группа:
 * `negative`, участник: `positive`).
 */
export function telegramInteger(
  value: string,
  sign: 'positive' | 'negative',
): number | undefined {
  const pattern = sign === 'positive' ? POSITIVE_INTEGER : NEGATIVE_INTEGER;
  if (!pattern.test(value)) return undefined;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : undefined;
}
