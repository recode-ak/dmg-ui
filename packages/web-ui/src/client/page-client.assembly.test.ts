import { describe, expect, test } from 'bun:test';
import { exampleCodes, examplePagesRoutes } from 'dmg-ui/example';
import { MemoryUiObserver } from 'dmg-ui/testing';
import { ExampleStubUiAppDef } from 'dmg-ui/testing/fixtures';
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
          codes: exampleCodes({}, ExampleStubUiAppDef),
          routes: examplePagesRoutes,
          end,
          observer: new MemoryUiObserver(),
        }),
    ).toThrow('канала dmg-ui-stub, а не dmg-ui-pages');
  });
});
