// Вход dmg-ui/tg-bot/testing: подставной порт Bot API в памяти и его типы —
// запись журнала, заданный отказ, сообщение чата глазами собеседника;
// построитель апдейтов личного чата и группы; перекрытие учебного примера
// под Telegram и показ его экранов запросами Bot API.

export { MemoryBotApi } from './bot-api/memory-bot-api';
export type {
  BotApiCall,
  BotApiFailNext,
  BotChatLine,
} from './bot-api/memory-bot-api.types';
export { EXAMPLE_MOMENT } from './example/example-telegram.const';
export { exampleTelegramViews } from './example/example-telegram.views';
export { ExampleTelegramPreview } from './example/example-telegram-preview';
export { TestUpdates } from './updates/test-updates';
export type {
  TestChatMemberUpdate,
  TestGroupTextUpdate,
  TestJoinRequestUpdate,
  TestMyChatMemberUpdate,
  TestPressUpdate,
  TestTextUpdate,
} from './updates/test-updates.types';
