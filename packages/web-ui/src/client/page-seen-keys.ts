import type { PageSeenKeysSpec } from './page-client.types';
import type { PageClock } from './page-clock.types';

/**
 * Отсев повторов вкладки: ключи с пределом числа и сроком (мс) от первого
 * приёма по часам вкладки (D-UI-75). Ключи лежат по порядку приёма, поэтому
 * истёкшие снимаются с головы, а сверх предела вытесняется старейший. Повтор
 * `add` срок не продлевает; часы назад лишь откладывают истечение.
 */
export class PageSeenKeys {
  private readonly limit: number;
  private readonly ttl: number;
  private readonly clock: PageClock;
  /** Ключ → время первого приёма; порядок вставки — порядок приёма. */
  private readonly keys = new Map<string, number>();

  constructor(spec: PageSeenKeysSpec) {
    this.limit = spec.limit;
    this.ttl = spec.ttl;
    this.clock = spec.clock;
  }

  has(key: string): boolean {
    this.expire();
    return this.keys.has(key);
  }

  add(key: string): void {
    this.expire();
    if (this.keys.has(key)) return;
    this.keys.set(key, this.clock.now());
    while (this.keys.size > this.limit) {
      const oldest = this.keys.keys().next();
      if (oldest.done === true) break;
      this.keys.delete(oldest.value);
    }
  }

  /** Ключ, принятый ровно `ttl` назад, истёк; голова не истекла — дальше не смотрим. */
  private expire(): void {
    const now = this.clock.now();
    for (const [key, at] of this.keys) {
      if (now - at < this.ttl) return;
      this.keys.delete(key);
    }
  }
}
