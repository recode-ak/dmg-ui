// Вход dmg-ui/tg-bot: мессенджер Telegram поверх узкого порта Bot API, его
// возможности и приём апдейтов (апдейт → сигнал беседы); типы порта и
// подмножества JSON Bot API — для реализации порта проектом и подставного
// порта.

export type {
  AnswerCallbackQueryParams,
  BotApi,
  BotApiMethod,
  BotApiRefusal,
  BotApiResult,
  EditMessageReplyMarkupParams,
  EditMessageTextParams,
  InlineKeyboardButton,
  InlineKeyboardMarkup,
  LinkPreviewOptions,
  MessageEntity,
  MessageEntityType,
  SendMessageParams,
} from './bot-api/bot-api.types';
export { TELEGRAM_CAPABILITIES } from './messenger/telegram.const';
export { TelegramMessenger } from './messenger/telegram-messenger';
export type { TelegramMessengerSpec } from './messenger/telegram-messenger.types';
export { TelegramUpdates } from './updates/telegram-updates';
export type { TelegramUpdatesSpec } from './updates/telegram-updates.types';
