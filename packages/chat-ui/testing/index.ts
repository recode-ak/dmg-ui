// Вход dmg-ui/chat-ui/testing: привязка учебного примера к диалоговому
// каналу — два приложения UI, представления и граф примера; подставной
// мессенджер в памяти и его типы: спека, строка беседы `ChatLine`, запись
// журнала.

export { ExampleDialogAppDef } from './example/example-dialog.app';
export { ExampleDialogArch } from './example/example-dialog.arch';
export { exampleDialogViews } from './example/example-dialog.views';
export { ExampleWindowedAppDef } from './example/example-windowed.app';
export { MemoryMessenger } from './messengers/memory-messenger';
export type {
  ChatLine,
  MemoryMessengerSpec,
  MessengerEntry,
} from './messengers/memory-messenger.types';
