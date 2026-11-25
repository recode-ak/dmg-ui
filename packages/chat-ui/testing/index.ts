// Вход dmg-ui/chat-ui/testing: привязка учебного примера к диалоговому
// каналу — три приложения UI, представления модулей и их сборка, граф
// примера; подставной мессенджер в памяти и его типы: спека, строка беседы
// `ChatLine`, запись журнала; примеры набора и проверка их лимитов (CH-01).

export { ExampleDialogArch } from './example/example-dialog.arch';
export { ExampleDialogUiAppDef } from './example/example-dialog.ui-app';
export { exampleDialogViews } from './example/example-dialog.views';
export { ExampleTrimmedUiAppDef } from './example/example-trimmed.ui-app';
export { ExampleWindowedUiAppDef } from './example/example-windowed.ui-app';
export { todoChatViews } from './example/todo-chat.views';
export { usersChatViews } from './example/users-chat.views';
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
