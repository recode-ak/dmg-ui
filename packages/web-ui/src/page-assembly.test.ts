import { describe, expect, test } from 'bun:test';
import {
  AwaitingBus,
  MemoryLogger,
  testUuid,
  useTempDir,
} from 'dmg-core/testing';
import { ExampleApp } from 'dmg-core/testing/example';
import { ApiAppDispatch, UiServer } from 'dmg-ui/server';
import {
  ExampleUiSetDef,
  exampleCodes,
  MemoryUiObserver,
} from 'dmg-ui/testing';
import { ExampleStubAppDef, T0 } from 'dmg-ui/testing/fixtures';
import { examplePageRoutes, examplePageViews } from '../testing';
import { PageClient } from './client/page-client';
import { PageHost } from './server/page-host';
import type { ClientEnd } from './wire/page-wire.types';

// Сборка половин страничного канала: приложение другого канала — ошибка
// сборки, бросок (ERR-01), как у диалогового канала.

const tmp = useTempDir('dmg-ui-page-assembly-');

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

describe('страничный канал — приложение другого канала', () => {
  test('PageClient — бросок с именем канала', () => {
    expect(
      () =>
        new PageClient({
          app: ExampleStubAppDef,
          codes: exampleCodes(),
          views: examplePageViews,
          routes: examplePageRoutes,
          end,
          observer: new MemoryUiObserver(),
        }),
    ).toThrow('канала dmg-ui-stub, а не dmg-ui-pages');
  });

  test('PageHost — бросок с именем канала', () => {
    const context = { bus: new AwaitingBus(), logger: new MemoryLogger() };
    const example = new ExampleApp(
      { mode: 'test', dataDir: tmp().path, users: [testUuid(1)] },
      { ...context, clock: () => T0 },
    );
    const server = new UiServer({
      set: ExampleUiSetDef,
      dispatch: new ApiAppDispatch(example.api),
      context,
    });

    expect(
      () =>
        new PageHost({
          app: ExampleStubAppDef,
          server,
          tokens: async () => undefined,
          callers: example.callers,
          places: {
            place: async () => ({ locale: 'ru-RU', timeZone: 'Asia/Oral' }),
          },
          logger: context.logger,
        }),
    ).toThrow('канала dmg-ui-stub, а не dmg-ui-pages');
  });
});
