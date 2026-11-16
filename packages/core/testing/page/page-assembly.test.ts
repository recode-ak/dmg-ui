import { describe, expect, test } from 'bun:test';
import {
  AwaitingBus,
  MemoryLogger,
  testUuid,
  useTempDir,
} from 'dmg-core/testing';
import { ExampleApp } from 'dmg-core/testing/example';
import { ApiAppDispatch, UiServer } from 'dmg-ui/server';
import { ExampleUiSetDef, exampleCodes } from '../example';
import { ExampleDialogAppDef } from '../example/dialog';
import { examplePageRoutes, examplePageViews } from '../example/pages';
import { MemoryUiObserver } from '../memory-ui-observer';
import { T0 } from '../ui-server-fixture';
import { PageClient } from './client/page-client';
import { PageHost } from './server/page-host';
import type { ClientEnd } from './wire/page-wire.types';

// Сборка половин страничного канала: приложение другого канала — ошибка
// сборки, бросок (ERR-01), как у `DialogChannel`.

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
          app: ExampleDialogAppDef,
          codes: exampleCodes(),
          views: examplePageViews,
          routes: examplePageRoutes,
          end,
          observer: new MemoryUiObserver(),
        }),
    ).toThrow('канала dmg-ui-dialog, а не dmg-ui-pages');
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
          app: ExampleDialogAppDef,
          server,
          tokens: () => undefined,
          identities: () => example.callers,
          logger: context.logger,
        }),
    ).toThrow('канала dmg-ui-dialog, а не dmg-ui-pages');
  });
});
