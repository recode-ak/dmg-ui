import { describe, expect, test } from 'bun:test';
import type { ConversationSnapshot } from './conversation.types';
import { MemoryConversationStore } from './memory-conversation-store';

// Хранилище снимков бесед в памяти: ключ — собеседник; снимок проходит круг
// JSON, сырое значение кладётся как есть — для мусора и переноса чужих
// снимков.

const snapshot = (person: string, serial: number): ConversationSnapshot => ({
  version: 1,
  person,
  serial,
  refs: [
    {
      ref: 'abcde1',
      kind: 'open',
      address: { screen: 'exampleUi/todo/taskList', params: { page: 0 } },
      label: 'К списку',
    },
  ],
  seen: ['u1'],
});

const ANNA = snapshot('00000000-0000-4000-8000-000000000001', 1);
const BORIS = snapshot('00000000-0000-4000-8000-000000000002', 2);

describe('MemoryConversationStore', () => {
  test('save → load — равный снимок, другой объект', async () => {
    const store = new MemoryConversationStore();

    await store.save('peer-a', ANNA);
    const first = await store.load('peer-a');
    const second = await store.load('peer-a');

    expect(first).toStrictEqual(ANNA);
    expect(first).not.toBe(ANNA);
    expect(second).toStrictEqual(ANNA);
    expect(second).not.toBe(first);
  });

  test('нет снимка — undefined', async () => {
    const store = new MemoryConversationStore();

    expect(await store.load('peer-a')).toBeUndefined();
  });

  test('put кладёт сырое значение как есть', async () => {
    const store = new MemoryConversationStore();

    store.put('peer-a', 'мусор');
    store.put('peer-b', null);
    store.put('peer-c', { version: 2, refs: 'нет' });

    expect(await store.load('peer-a')).toBe('мусор');
    expect(await store.load('peer-b')).toBeNull();
    expect(await store.load('peer-c')).toStrictEqual({
      version: 2,
      refs: 'нет',
    });
  });

  test('собеседники раздельны', async () => {
    const store = new MemoryConversationStore();

    await store.save('peer-a', ANNA);
    await store.save('peer-b', BORIS);

    expect(await store.load('peer-a')).toStrictEqual(ANNA);
    expect(await store.load('peer-b')).toStrictEqual(BORIS);
    expect(await store.load('peer-c')).toBeUndefined();
  });

  test('повторный save заменяет снимок собеседника', async () => {
    const store = new MemoryConversationStore();
    store.put('peer-a', 'мусор');

    await store.save('peer-a', ANNA);
    await store.save('peer-a', BORIS);

    expect(await store.load('peer-a')).toStrictEqual(BORIS);
  });
});
