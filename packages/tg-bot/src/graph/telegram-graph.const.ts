import * as v from 'valibot';

/** Имя поставщика графа Telegram (префикс правил `TG`). */
export const TELEGRAM_PROVIDER = 'dmg-ui-tg';

/** Версия поставщика графа Telegram. */
export const TELEGRAM_VERSION = '0.6.0';

/**
 * Свойства узла `chatEntryPoint`, как их читают правила TG: вид и сверку
 * свойств уже сделал граф, здесь — своя проверка для своего вывода
 * (`CHAT_ENTRY_POINT_PROPS` `chat-ui` не экспортируется).
 */
export const POINT_PROPS = v.looseObject({
  entry: v.string(),
  via: v.string(),
  key: v.string(),
});

/** Свойство `name` узла `chatMessenger` — имя мессенджера приложения. */
export const MESSENGER_NAME_PROPS = v.looseObject({ name: v.string() });

/** Свойство `entry` узла `chatEntry` — имя входа приложения UI. */
export const ENTRY_PROPS = v.looseObject({ entry: v.string() });
