import { describe, expect, test } from 'bun:test';
import type { AddressJson } from 'dmg-ui';
import { MemoryLinkStore } from './memory-link-store';

// Хранилище ссылок в памяти: код ↔ адрес. Как `MemoryConversationStore`,
// проходит круг через JSON — хранит копию, отдаёт новый объект (адрес —
// простые данные). Выдачу и коллизии решает беседа, не хранилище.

const CODE_A = 'A'.repeat(22);
const CODE_B = 'B'.repeat(22);

const LIST: AddressJson = {
  screen: 'exampleUi/todo/taskList',
  params: { page: 0 },
};
const MENU: AddressJson = { screen: 'exampleUi/todo/mainMenu', params: {} };

describe('MemoryLinkStore', () => {
  test('put → get: равный адрес, другой объект', async () => {
    const store = new MemoryLinkStore();

    await store.put(CODE_A, LIST);
    const first = await store.get(CODE_A);
    const second = await store.get(CODE_A);

    expect(first).toStrictEqual(LIST);
    expect(first).not.toBe(LIST);
    expect(second).toStrictEqual(LIST);
    expect(second).not.toBe(first);
  });

  test('нет записи — undefined', async () => {
    const store = new MemoryLinkStore();

    expect(await store.get(CODE_A)).toBeUndefined();
  });

  test('хранится копия: правка исходного адреса и полученного не меняет запись', async () => {
    const store = new MemoryLinkStore();
    const address = { screen: 'a/b/c', params: { page: 0 } };

    await store.put(CODE_A, address);
    address.params.page = 9;
    const got = await store.get(CODE_A);
    if (got === undefined) throw new Error('записи нет');
    (got.params as { page: number }).page = 7;

    expect(await store.get(CODE_A)).toStrictEqual({
      screen: 'a/b/c',
      params: { page: 0 },
    });
  });

  test('коды раздельны', async () => {
    const store = new MemoryLinkStore();

    await store.put(CODE_A, LIST);
    await store.put(CODE_B, MENU);

    expect(await store.get(CODE_A)).toStrictEqual(LIST);
    expect(await store.get(CODE_B)).toStrictEqual(MENU);
    expect(await store.get('C'.repeat(22))).toBeUndefined();
  });
});
