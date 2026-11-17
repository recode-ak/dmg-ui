// Вход dmg-ui/tg-bot/testing: подставной порт Bot API в памяти и его типы —
// запись журнала, заданный отказ, сообщение чата глазами собеседника;
// построитель апдейтов личного чата и группы.

export { MemoryBotApi } from './bot-api/memory-bot-api';
export type {
  BotApiCall,
  BotApiFailNext,
  BotChatLine,
} from './bot-api/memory-bot-api.types';
export { TestUpdates } from './updates/test-updates';
export type {
  TestChatMemberUpdate,
  TestGroupTextUpdate,
  TestJoinRequestUpdate,
  TestMyChatMemberUpdate,
  TestPressUpdate,
  TestTextUpdate,
} from './updates/test-updates.types';
