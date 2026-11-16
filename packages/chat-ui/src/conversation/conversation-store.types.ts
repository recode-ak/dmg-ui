import type { ConversationSnapshot } from './conversation.types';

// Порт хранилища снимков бесед (D-UI-45).

/**
 * Хранилище снимков бесед одного приложения мессенджера: ключ — собеседник
 * (`peer`). Доверенное: в снимке данные собеседника (черновик, вход
 * подтверждения, uuid). Бросок `load` или `save` — сбой хранилища: беседа
 * пишет `error` без данных и работает дальше в памяти.
 */
export type ConversationStore = {
  /** Снимок собеседника как есть (внешние данные); нет — `undefined`. */
  load(peer: string): Promise<unknown>;
  save(peer: string, snapshot: ConversationSnapshot): Promise<void>;
};
