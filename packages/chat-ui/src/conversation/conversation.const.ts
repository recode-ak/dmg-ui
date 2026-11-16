// Пределы данных беседы: отсев повтора сигналов и таблица ссылок.

/** id сигналов, которые помнит беседа для отсева повтора. */
export const MAX_SEEN = 128;

/** Длина id сигнала в символах. */
export const MAX_SIGNAL_ID = 256;

/** Записей в таблице ссылок беседы; сверх — вытесняются старейшие. */
export const MAX_REFS = 256;

/** Длина ссылки: эпоха и 11 знаков base36 для `Number.MAX_SAFE_INTEGER`. */
export const MAX_REF_LENGTH = 16;

/** Длина эпохи ссылок в знаках `[a-z0-9]`. */
export const REF_EPOCH_LENGTH = 5;

/** Знаки ссылки и эпохи. */
export const REF_PATTERN = /^[a-z0-9]+$/;
