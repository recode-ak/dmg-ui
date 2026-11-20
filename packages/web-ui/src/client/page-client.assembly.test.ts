import { describe, expect, test } from 'bun:test';
import { exampleCodes, MemoryUiObserver } from 'dmg-ui/testing';
import { ExampleStubUiAppDef } from 'dmg-ui/testing/fixtures';
import { examplePagesRoutes } from '../../testing';
import type { ClientEnd } from '../wire/page-wire.types';
import { PageClient } from './page-client';

// Сборка клиентской половины страничного канала: приложение другого канала —
// ошибка сборки, бросок (ERR-01), как у диалогового канала.

const end: ClientEnd = {
  context: {
    locale: 'ru-RU',
    timeZone: 'Asia/Oral',
    delegate: false,
    readOnly: false,
  },
  send: () => {},
  onMessage: () => {},
  onBreak: () => {},
  close: () => {},
};

describe('PageClient — приложение другого канала', () => {
  test('бросок с именем канала', () => {
    expect(
      () =>
        new PageClient({
          app: ExampleStubUiAppDef,
          codes: exampleCodes(),
          routes: examplePagesRoutes,
          end,
          observer: new MemoryUiObserver(),
        }),
    ).toThrow('канала dmg-ui-stub, а не dmg-ui-pages');
  });
});
