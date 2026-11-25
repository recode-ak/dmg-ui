// Вход dmg-ui/chat-ui/testing: подставной мессенджер в памяти и его типы —
// спека, строка беседы `ChatLine`, запись журнала; примеры набора и проверка
// их лимитов (CH-01). Учебный проект и его привязка к каналу — вход
// dmg-ui/example.

export {
  ChatExamples,
  type ChatExamplesSpec,
  type ChatNotificationExample,
  type ChatScreenExample,
} from './limits/chat-examples';
export { ExampleLimits } from './limits/example-limits';
export { MemoryMessenger } from './messengers/memory-messenger';
export type {
  ChatLine,
  MemoryMessengerSpec,
  MessengerEntry,
} from './messengers/memory-messenger.types';
