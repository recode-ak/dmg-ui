import type { AttachmentKind } from 'dmg-ui/chat-ui';
import type { RefusedUpdateKind } from './telegram-updates.types';

/** Команда в начале текста: `/имя` и, в группе, `@бот`; имя — по правилам Bot API, до 32 знаков. */
export const COMMAND = /^\/([A-Za-z0-9_]{1,32})(?:@[A-Za-z0-9_]+)?$/;

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
] as const satisfies readonly RefusedUpdateKind[];

/** Виды апдейта группы: при апдейте не по схеме вид попадает в отказ. */
export const COMMUNITY_UPDATES = [
  'my_chat_member',
  'chat_member',
  'chat_join_request',
] as const satisfies readonly RefusedUpdateKind[];
