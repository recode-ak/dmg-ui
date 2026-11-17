import { MAX_REFS, REF_EPOCH_LENGTH, REF_PATTERN } from './conversation.const';
import type { RefEntry, RefTarget, Serial } from './conversation.types';

/**
 * Таблица ссылок беседы — данные (D-UI-44): ссылка `${epoch}${счётчик в base36}`,
 * только `[a-z0-9]`, до 16 знаков. Эпоха новая на каждое воплощение беседы,
 * счётчик в памяти начинается с 1, поэтому ссылка не повторяется ни после
 * вытеснения, ни после восстановления. Сверх `MAX_REFS` записей вытесняются
 * старейшие (порядок выдачи).
 */
export class RefTable {
  private readonly entries = new Map<string, RefEntry>();
  private counter = 0;

  /** `entries` — из снимка, старые первыми; эпоха не из `[a-z0-9]{5}` — бросок (дефект сборки). */
  constructor(
    private readonly epoch: string,
    entries: readonly RefEntry[] = [],
  ) {
    if (epoch.length !== REF_EPOCH_LENGTH || !REF_PATTERN.test(epoch)) {
      throw new Error(
        `эпоха ссылок — ${REF_EPOCH_LENGTH} знаков [a-z0-9], получено ${epoch.length}`,
      );
    }
    for (const entry of entries) this.put(entry);
  }

  /** Новая ссылка на цель. */
  add(target: RefTarget): string {
    this.counter += 1;
    const ref = `${this.epoch}${this.counter.toString(36)}`;
    this.put({ ref, ...target });
    return ref;
  }

  /** Запись по ссылке; не выдавалась или вытеснена — `undefined` (внешний ввод, не бросок). */
  entry(ref: string): RefEntry | undefined {
    return this.entries.get(ref);
  }

  /** Записи действий экрана с прежней ревизией получают новую; ссылки и порядок прежние. */
  rebase(screen: Serial, from: number, to: number): void {
    for (const [ref, entry] of this.entries) {
      this.entries.set(ref, this.rebased(entry, screen, from, to));
    }
  }

  /** Для снимка: записи, старые первыми, не больше `MAX_REFS`. */
  toJSON(): readonly RefEntry[] {
    return [...this.entries.values()];
  }

  private put(entry: RefEntry): void {
    this.entries.delete(entry.ref);
    this.entries.set(entry.ref, entry);
    if (this.entries.size > MAX_REFS) this.evictOldest();
  }

  private evictOldest(): void {
    const oldest = this.entries.keys().next();
    if (oldest.done !== true) this.entries.delete(oldest.value);
  }

  /** Запись действия экрана с прежней ревизией — с новой; другая — как есть. */
  private rebased(
    entry: RefEntry,
    screen: Serial,
    from: number,
    to: number,
  ): RefEntry {
    switch (entry.kind) {
      case 'action':
      case 'local':
      case 'confirm':
        return entry.screen === screen && entry.revision === from
          ? { ...entry, revision: to }
          : entry;
      case 'choice':
      case 'skip':
      case 'page':
      case 'open':
      case 'back':
      case 'home':
        return entry;
      default: {
        const unknownKind: never = entry;
        throw new Error(`неизвестный вид записи: ${String(unknownKind)}`);
      }
    }
  }
}
