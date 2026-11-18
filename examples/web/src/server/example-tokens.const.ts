/** Файл с пропусками людей в каталоге данных. */
export const TOKENS_FILE = 'tokens.json';

/** Права файла пропусков: читает и пишет только владелец. */
export const TOKENS_MODE = 0o600;

/** Сколько случайных байт в пропуске (43 знака base64url). */
export const TOKEN_BYTES = 32;

/** Форма пропуска: 32 байта в base64url без заполнителя. */
export const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;
