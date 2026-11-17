// Учебный диалоговый канал: зародыш пакета канала на публичных
// входах ядра. Вход `dmg-ui/chat-ui` собирает его в `src/index.ts`.

export type { Dialog } from './dialog';
export type {
  DialogChannelSpec,
  DialogOption,
  DialogPlace,
  DialogReply,
} from './dialog.types';
export { DialogChannel } from './dialog-channel';
export { DIALOG_CHANNEL } from './dialog-channel.const';
export {
  DialogGraphProvider,
  type DialogGraphSpec,
} from './dialog-graph-provider';
export { DialogRenderer } from './dialog-renderer';
