import { MAX_SEEN } from './conversation.const';

/**
 * Отсев повтора сигналов беседы по id (D-UI-43). Помнит `MAX_SEEN` id в порядке
 * первого приёма; сверх предела вытесняется принятый раньше всех, повтор
 * его не освежает. Данные — в снимке беседы, старые первыми.
 */
export class SeenSignals {
  private readonly order: string[] = [];
  private readonly known = new Set<string>();

  /** `ids` — из снимка; повторы и id сверх предела отбрасываются, как при приёме по одному. */
  constructor(ids: readonly string[] = []) {
    for (const id of ids) this.accept(id);
  }

  /** Новый id — true и запомнен; повтор — false. */
  accept(id: string): boolean {
    if (this.known.has(id)) return false;
    this.order.push(id);
    this.known.add(id);
    if (this.order.length > MAX_SEEN) this.forgetOldest();
    return true;
  }

  /** Для снимка: не длиннее `MAX_SEEN`, старые первыми. */
  toJSON(): readonly string[] {
    return [...this.order];
  }

  private forgetOldest(): void {
    const oldest = this.order.shift();
    if (oldest !== undefined) this.known.delete(oldest);
  }
}
