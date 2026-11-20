import { describe, expect, test } from 'bun:test';
import { ok } from 'dmg-core';
import { ModuleApi } from 'dmg-core/app';
import { AwaitingBus, MemoryLogger } from 'dmg-core/testing';
import { TodoModuleDef } from 'dmg-core/testing/example';
import { ExampleUiSetDef, OWNER } from '../../testing/example';
import { TASKS } from '../../testing/ui-runtime-fixture';
import {
  StubCallerSource,
  StubTransport,
} from '../../testing/ui-server-fixture';
import { ModuleApiDispatch } from './module-api-dispatch';
import { UiServer } from './ui-server';

// Бэкенд вызова UC сервера — `ModuleApi` вне процесса; ответ сессии — `SerializedResult`.

describe('ModuleApiDispatch — модуль вне процесса', () => {
  test('ответ транспорта приходит без изменений', async () => {
    const logger = new MemoryLogger();
    const transport = new StubTransport().answer('listTasks', ok([...TASKS]));
    const server = new UiServer({
      set: ExampleUiSetDef,
      dispatch: new ModuleApiDispatch([
        new ModuleApi(TodoModuleDef, transport, logger),
      ]),
      context: { bus: new AwaitingBus(), logger },
    });

    const res = await server.session(new StubCallerSource(OWNER)).call({
      module: 'todo',
      uc: 'listTasks',
      input: {},
      requestId: 'r-1',
    });

    expect(res).toEqual(ok([...TASKS]));
  });
});
