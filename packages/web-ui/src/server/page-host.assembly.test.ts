import { describe, expect, test } from 'bun:test';
import {
  AwaitingBus,
  MemoryLogger,
  testUuid,
  useTempDir,
} from 'dmg-core/testing';
import { ExampleApp } from 'dmg-core/testing/example';
import { ExampleUiSetDef } from 'dmg-ui/example';
import { ApiAppDispatch, UiServer } from 'dmg-ui/server';
import { ExampleStubUiAppDef, T0 } from 'dmg-ui/testing/fixtures';
import { PageHost } from './page-host';

// Сборка серверной половины страничного канала: приложение другого канала —
// ошибка сборки, бросок (ERR-01), как у диалогового канала.

const tmp = useTempDir('dmg-ui-page-assembly-');

describe('PageHost — приложение другого канала', () => {
  test('бросок с именем канала', () => {
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
          app: ExampleStubUiAppDef,
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
