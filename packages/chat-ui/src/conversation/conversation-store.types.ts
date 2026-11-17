import type { ConversationSnapshot } from './conversation.types';

// Порт хранилища снимков бесед (D-UI-45).

/**
 * Хранилище снимков бесед одного приложения мессенджера: ключ — собеседник
 * (`peer`), строка мессенджера без предела — в путь файла как есть не
 * кладётся. Доверенное: в снимке данные собеседника. Бросок — `error` без
 * данных: `load` — сигнал не исполняется, `save` — беседа работает в памяти.
 */
export type ConversationStore = {
  /** Снимок собеседника как есть (внешние данные); нет — `undefined`. */
  load(peer: string): Promise<unknown>;
  save(peer: string, snapshot: ConversationSnapshot): Promise<void>;
};
