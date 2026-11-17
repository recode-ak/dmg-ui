import type { Moment } from 'dmg-ui/chat-ui';

/**
 * Момент примера (D-UI-67): `2026-11-20 12:00` в часовом поясе `Asia/Oral`
 * (UTC+5). В данных учебного примера дат нет и ядро не меняется — момент
 * постоянный, показ — `dateTime`.
 */
export const EXAMPLE_MOMENT: Moment = { at: 1795158000, show: 'dateTime' };

/** Запасной текст момента: он же в мессенджерах без даты; часовой пояс — `Asia/Oral`. */
export const EXAMPLE_MOMENT_FALLBACK = '20 ноября 2026, 12:00';

/** Метка перед моментом в карточке открытой задачи; к данным задачи не относится. */
export const EXAMPLE_MOMENT_LABEL = 'Напоминание (пример): ';

/** Получатель запроса в превью: любое целое положительное — чат примера. */
export const EXAMPLE_CHAT = 1;

/** Контекст примера: тот же, что по умолчанию у `ExamplePreview`. */
export const EXAMPLE_CONTEXT = {
  locale: 'ru-RU',
  timeZone: 'Asia/Oral',
  delegate: false,
  readOnly: false,
} as const;
