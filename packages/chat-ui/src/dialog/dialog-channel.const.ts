import type { DialogPlace } from './dialog.types';

/** Имя учебного диалогового канала: канал приложения UI, след и поставщик графа. */
export const DIALOG_CHANNEL = 'dmg-ui-dialog';

/** Версия поставщика графа диалогового канала. */
export const DIALOG_VERSION = '0.1.0';

/** Вход приложения UI, к которому диалог возвращается после выхода сторис. */
export const DIALOG_HOME = 'start';

/** Место личности по умолчанию. */
export const DIALOG_PLACE: DialogPlace = {
  locale: 'ru-RU',
  timeZone: 'Asia/Oral',
};
