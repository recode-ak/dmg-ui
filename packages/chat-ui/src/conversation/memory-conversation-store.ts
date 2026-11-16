import type { ConversationSnapshot } from './conversation.types';
import type { ConversationStore } from './conversation-store.types';

/**
 * Хранилище снимков бесед в памяти (D-UI-45): строка `JSON.stringify` по
 * собеседнику, `load` отдаёт `JSON.parse` — каждый раз новый объект; круг
 * через JSON доказывает JSON-представимость снимка.
 */
export class MemoryConversationStore implements ConversationStore {
  private readonly snapshots = new Map<string, string>();

  load(peer: string): Promise<unknown> {
    const json = this.snapshots.get(peer);
    return Promise.resolve(json === undefined ? undefined : JSON.parse(json));
  }

  save(peer: string, snapshot: ConversationSnapshot): Promise<void> {
    this.snapshots.set(peer, JSON.stringify(snapshot));
    return Promise.resolve();
  }

  /** Сырое значение как есть, без схемы — для мусора и переноса чужих снимков. */
  put(peer: string, raw: unknown): void {
    this.snapshots.set(peer, JSON.stringify(raw));
  }
}
