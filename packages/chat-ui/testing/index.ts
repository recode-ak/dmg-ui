// Вход dmg-ui/chat-ui/testing: привязка учебного примера к диалоговому
// каналу — три приложения UI, представления и граф примера; подставной
// мессенджер в памяти и его типы: спека, строка беседы `ChatLine`, запись
// журнала.

export { ExampleDialogArch } from './example/example-dialog.arch';
export { ExampleDialogUiAppDef } from './example/example-dialog.ui-app';
export { exampleDialogViews } from './example/example-dialog.views';
export { ExampleTrimmedUiAppDef } from './example/example-trimmed.ui-app';
export { ExampleWindowedUiAppDef } from './example/example-windowed.ui-app';
export { MemoryMessenger } from './messengers/memory-messenger';
export type {
  ChatLine,
  MemoryMessengerSpec,
  MessengerEntry,
} from './messengers/memory-messenger.types';
