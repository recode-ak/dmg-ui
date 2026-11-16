import type { UiObserver, UiRecord } from 'dmg-ui';

/** Наблюдатель исполнителя в памяти: записи по порядку (тесты и учебные каналы). */
export class MemoryUiObserver implements UiObserver {
  readonly records: UiRecord[] = [];

  record(entry: UiRecord): void {
    this.records.push(entry);
  }

  kinds(): string[] {
    return this.records.map((entry) => entry.kind);
  }
}
