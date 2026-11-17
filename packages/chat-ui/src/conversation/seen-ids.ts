import { MAX_SEEN } from './conversation.const';

/**
 * Отсев повтора по id (D-UI-43): сигналы беседы и ключи уведомлений. Помнит
 * не больше `limit` id (по умолчанию `MAX_SEEN`) в порядке первого приёма;
 * сверх предела вытесняется принятый раньше всех, повтор его не освежает.
 * Данные — в снимке беседы, старые первыми.
 */
export class SeenIds {
  private readonly order: string[] = [];
  private readonly known = new Set<string>();

  /** `ids` — из снимка; повторы и id сверх предела отбрасываются, как при приёме по одному. */
  constructor(
    ids: readonly string[] = [],
    private readonly limit = MAX_SEEN,
  ) {
    for (const id of ids) this.accept(id);
  }

  /** id уже принят и не вытеснен. */
  has(id: string): boolean {
    return this.known.has(id);
  }

  /** Новый id — true и запомнен; повтор — false. */
  accept(id: string): boolean {
    if (this.known.has(id)) return false;
    this.order.push(id);
    this.known.add(id);
    if (this.order.length > this.limit) this.forgetOldest();
    return true;
  }

  /** Для снимка: не длиннее предела, старые первыми. */
  toJSON(): readonly string[] {
    return [...this.order];
  }

  private forgetOldest(): void {
    const oldest = this.order.shift();
    if (oldest !== undefined) this.known.delete(oldest);
  }
}
