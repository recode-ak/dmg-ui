import type { AddressJson } from 'dmg-ui';
import type { LinkStore } from './conversation.types';

/**
 * Хранилище ссылок на экран в памяти (D-UI-127): строка `JSON.stringify` по
 * коду, `get` отдаёт `JSON.parse` — каждый раз новый объект. Выдачу и
 * коллизии решает беседа, не хранилище. Файловое хранилище — у проекта.
 *
 * @see memory-link-store.test.ts
 */
export class MemoryLinkStore implements LinkStore {
  private readonly links = new Map<string, string>();

  get(code: string): Promise<AddressJson | undefined> {
    const json = this.links.get(code);
    return Promise.resolve(json === undefined ? undefined : JSON.parse(json));
  }

  put(code: string, address: AddressJson): Promise<void> {
    this.links.set(code, JSON.stringify(address));
    return Promise.resolve();
  }
}
