// Вход dmg-ui/tg-bot: мессенджер Telegram поверх узкого порта Bot API, его
// возможности, приём апдейтов (апдейт → сигнал беседы или сообщества), точки
// входа, меню команд, формат ссылки на экран (`TelegramLinks`) и поставщик
// графа Telegram (правила TG); типы порта и подмножества JSON Bot API — для
// реализации порта проектом и подставного порта.

export type {
  AnswerCallbackQueryParams,
  ApproveChatJoinRequestParams,
  BanChatMemberParams,
  BotApi,
  BotApiMethod,
  BotApiRefusal,
  BotApiResult,
  BotCommand,
  BotCommandScope,
  ButtonStyle,
  CallbackButton,
  DisabledButton,
  EditMessageReplyMarkupParams,
  EditMessageTextParams,
  InlineKeyboardButton,
  InlineKeyboardMarkup,
  LinkPreviewOptions,
  MessageEntity,
  MessageEntityType,
  SendMessageParams,
  SetMyCommandsParams,
  UnbanChatMemberParams,
} from './bot-api/bot-api.types';
export { TELEGRAM_VIA } from './entries/telegram-entries.const';
export type { TelegramVia } from './entries/telegram-entries.types';
export { TelegramLinks } from './entries/telegram-links';
export { TelegramMenu } from './entries/telegram-menu';
export { TelegramGraphProvider } from './graph/telegram-graph-provider';
export { TELEGRAM_CAPABILITIES } from './messenger/telegram.const';
export { TelegramMessenger } from './messenger/telegram-messenger';
export type { TelegramMessengerSpec } from './messenger/telegram-messenger.types';
export { TelegramUpdates } from './updates/telegram-updates';
export { TELEGRAM_ALLOWED_UPDATES } from './updates/telegram-updates.const';
export type { TelegramUpdatesSpec } from './updates/telegram-updates.types';
