// Вход dmg-ui/tg-bot/testing: подставной порт Bot API в памяти и его типы —
// запись журнала, заданный отказ, сообщение чата глазами собеседника.

export { MemoryBotApi } from './bot-api/memory-bot-api';
export type {
  BotApiCall,
  BotApiFailNext,
  BotChatLine,
} from './bot-api/memory-bot-api.types';
