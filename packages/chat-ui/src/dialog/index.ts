// Учебный диалоговый канал: имя канала, поставщик графа и рендерер примеров.
// Вход `dmg-ui/chat-ui` собирает их в `src/index.ts`.

export { DIALOG_CHANNEL } from './dialog-channel.const';
export {
  DialogGraphProvider,
  type DialogGraphSpec,
} from './dialog-graph-provider';
export { DialogRenderer } from './dialog-renderer';
