import type { AttachmentKind } from 'dmg-ui/chat-ui';

/** Команда в начале текста: `/имя` и, в группе, `@бот`; имя — по правилам Bot API, до 32 знаков. */
export const COMMAND = /^\/([A-Za-z0-9_]{1,32})(?:@[A-Za-z0-9_]+)?$/;

/** Параметр `/start` (глубокая ссылка Bot API): до 64 знаков `[A-Za-z0-9_-]`. */
export const START_PARAM = /^[A-Za-z0-9_-]{1,64}$/;

/** Вид сущности команды. */
export const BOT_COMMAND = 'bot_command';

/**
 * Вложения сообщения по порядку проверки (кроме фото): анимация — раньше
 * документа, Bot API ставит рядом с ней и `document`.
 */
export const ATTACHMENT_FIELDS = [
  ['animation', 'video'],
  ['video', 'video'],
  ['video_note', 'video'],
  ['document', 'file'],
  ['audio', 'audio'],
  ['voice', 'audio'],
] as const satisfies readonly (readonly [string, AttachmentKind])[];

/**
 * Виды апдейта, которые читает пакет: проект подаёт их в `getUpdates` или
 * вебхук (без `chat_member` апдейты участников группы не придут).
 */
export const TELEGRAM_ALLOWED_UPDATES = [
  'message',
  'callback_query',
  'my_chat_member',
  'chat_member',
  'chat_join_request',
] as const;
