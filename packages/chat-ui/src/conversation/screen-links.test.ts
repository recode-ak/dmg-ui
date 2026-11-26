import { describe, expect, test } from 'bun:test';
import { MemoryLogger } from 'dmg-core/testing';
import type { AddressCodec, AddressJson } from 'dmg-ui';
import { CONVERSATION_TEXTS } from './conversation.const';
import { ConversationLog } from './conversation-log';
import type { ConversationOutput } from './conversation-output';
import type { ConversationScreens } from './conversation-screens';
import { MemoryLinkStore } from './memory-link-store';
import { ScreenLinks } from './screen-links';

// Выдача ссылки на адрес, которого нет в учебном наборе: параметр с
// `undefined` (экран с необязательным параметром) и адрес без
// JSON-представления. Живой экран и место — подставные: проверяется только
// `ScreenLinks.issue` (D-UI-127); остальное — `conversation-links.test.ts`.

const BASE = 'https://t.me/example_link_bot?start=';

/** Выдача ссылок на подставном живом экране с адресом `address`. */
const setup = (first: AddressJson) => {
  const store = new MemoryLinkStore();
  const puts: string[] = [];
  const notes: string[] = [];
  const logger = new MemoryLogger();
  let address = first;
  const screens = {
    current: () => ({ serial: 1, instance: { snapshot: () => ({ address }) } }),
  } as unknown as ConversationScreens;
  const output = {
    note: async (text: string) => {
      notes.push(text);
    },
  } as unknown as ConversationOutput;
  const links = new ScreenLinks({
    links: {
      store: {
        get: (code) => store.get(code),
        put: async (code, value) => {
          puts.push(code);
          await store.put(code, value);
        },
      },
      url: (code) => `${BASE}${code}`,
    },
    screens,
    output,
    log: new ConversationLog(logger, 'memory'),
    codec: {} as AddressCodec,
  });
  return {
    links,
    puts,
    notes,
    logger,
    /** Экран поднят из снимка: адрес прошёл круг через JSON. */
    woke: () => {
      address = JSON.parse(JSON.stringify(address));
    },
  };
};

describe('ScreenLinks.issue — адрес вне круга через JSON', () => {
  test('параметр с undefined: повтор и экран после wake — тот же URL, одна запись, без коллизии', async () => {
    const s = setup({
      screen: 'm/n/list',
      params: { page: 0, filter: undefined },
    } as AddressJson);

    await s.links.issue();
    await s.links.issue();
    s.woke();
    await s.links.issue();

    const urls = s.notes.map((note) => note.split('\n')[1]);
    expect(urls[0]?.startsWith(BASE)).toBe(true);
    expect(new Set(urls).size).toBe(1);
    expect(s.puts).toHaveLength(1);
    expect(s.logger.records.some((r) => r.level === 'error')).toBe(false);
  });

  test('адрес без JSON-представления: не бросает — «Ссылку выдать не удалось.» и error с операцией code', async () => {
    const s = setup({
      screen: 'm/n/list',
      params: { n: 1n },
    } as unknown as AddressJson);

    await s.links.issue();

    expect(s.notes).toEqual([CONVERSATION_TEXTS.linkFailed]);
    expect(s.puts).toEqual([]);
    const errors = s.logger.records.filter((r) => r.level === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.meta).toMatchObject({ operation: 'code' });
  });
});
