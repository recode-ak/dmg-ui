/**
 * Способы точки входа Telegram (D-UI-64): `command` — человек пишет `/key`;
 * `menu` — выбирает команду в меню бота (апдейт её от набранной не отличает:
 * точка нужна, чтобы `TelegramMenu` опубликовал команду); `link` — открывает
 * `t.me/<бот>?start=<key>`.
 */
export const TELEGRAM_VIA = {
  command: 'command',
  menu: 'menu',
  link: 'link',
} as const;

/** Вход-заглушка для имени, которого нет в таблице: имени входа с `!` у приложения быть не может — беседа ответит «Такого входа нет.». */
export const UNKNOWN_ENTRY = '!unknown';

/** Имя команды Bot API (ключ `command` и `menu`): строчные латинские, цифры, `_`, 1–32. */
export const COMMAND_KEY = /^[a-z0-9_]{1,32}$/;

/** Формат ключа команды — для текста нарушения TG-02. */
export const COMMAND_KEY_FORMAT = '[a-z0-9_]{1,32}';

/** Параметр глубокой ссылки Bot API (ключ `link`): `A-Z a-z 0-9 _ -`, 1–64. */
export const LINK_KEY = /^[A-Za-z0-9_-]{1,64}$/;

/** Формат ключа ссылки — для текста нарушения TG-02. */
export const LINK_KEY_FORMAT = '[A-Za-z0-9_-]{1,64}';

/** Команды, которые приём отдаёт беседе раньше таблицы (TG-04): отмена, «Назад», справка, ссылка на экран. */
export const RESERVED_COMMANDS = ['cancel', 'back', 'help', 'link'] as const;

/** Имя бота Bot API (`getMe`) для ссылки `t.me/<имя>`: латинские, цифры, `_`, 5–32. */
export const BOT_USERNAME = /^[A-Za-z0-9_]{5,32}$/;

/** Команда `/start` — вход новичка (кнопка «Запустить» в пустом чате). */
export const START_COMMAND = 'start';

/** Пределы `setMyCommands`: число команд и длина описания (UTF-16 — единица в Bot API не названа). */
export const MENU_LIMITS = { commands: 100, description: 256 } as const;
