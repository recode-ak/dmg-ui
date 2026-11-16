import { describe, expect, test } from 'bun:test';
import { ok } from 'dmg-core';
import { ModuleApi } from 'dmg-core/app';
import { AwaitingBus, MemoryLogger, useTempDir } from 'dmg-core/testing';
import { ExampleApp, TodoModuleDef } from 'dmg-core/testing/example';
import { ExampleUiSetDef, OWNER, TASK_A } from '../../testing/ui-fixture';
import {
  CARD_ID,
  LIST_ID,
  requestTrace,
  TASKS,
} from '../../testing/ui-runtime-fixture';
import {
  StubCallerSource,
  StubTransport,
  T0,
} from '../../testing/ui-server-fixture';
import { ApiAppDispatch } from './api-app-dispatch';
import { ModuleApiDispatch } from './module-api-dispatch';
import { UiServer } from './ui-server';

// Бэкенды вызова UC сервера: in-proc `ApiApp` и
// `ModuleApi` вне процесса; ответ сессии — `SerializedResult`.

const tmp = useTempDir('dmg-ui-dispatch-');

const context = () => ({ bus: new AwaitingBus(), logger: new MemoryLogger() });

/** Сессия владельца на учебном приложении; вызывающий — его резолвер. */
const appSession = () => {
  const example = new ExampleApp(
    { mode: 'test', dataDir: tmp().path, users: [OWNER] },
    { ...context(), clock: () => T0 },
  );
  const server = new UiServer({
    set: ExampleUiSetDef,
    dispatch: new ApiAppDispatch(example.api),
    context: context(),
  });
  return server.session({
    subjectId: OWNER,
    resolve: (trace) => example.callers.resolve(OWNER, trace),
  });
};

describe('ApiAppDispatch — приложение в процессе', () => {
  test('успех — Ok с выходом UC', async () => {
    const res = await appSession().call({
      node: LIST_ID,
      uc: 'createTask',
      input: { title: 'Хлеб' },
      trace: requestTrace('r-1'),
    });

    expect(res).toEqual({ ok: true, value: { taskId: expect.any(String) } });
  });

  test('отказ UC — ошибка в форме транспорта: код, вид, payload', async () => {
    const res = await appSession().call({
      node: CARD_ID,
      uc: 'completeTask',
      input: { taskId: TASK_A },
      trace: requestTrace('r-1'),
    });

    expect(res).toEqual({
      ok: false,
      error: {
        code: 'TASK_NOT_FOUND',
        kind: 'not_found',
        payload: { taskId: TASK_A },
      },
    });
  });
});

describe('ModuleApiDispatch — модуль вне процесса', () => {
  test('ответ транспорта приходит без изменений', async () => {
    const { logger } = context();
    const transport = new StubTransport().answer('listTasks', ok([...TASKS]));
    const server = new UiServer({
      set: ExampleUiSetDef,
      dispatch: new ModuleApiDispatch([
        new ModuleApi(TodoModuleDef, transport, logger),
      ]),
      context: { bus: new AwaitingBus(), logger },
    });

    const res = await server.session(new StubCallerSource(OWNER)).call({
      node: LIST_ID,
      uc: 'listTasks',
      input: {},
      trace: requestTrace('r-1'),
    });

    expect(res).toEqual(ok([...TASKS]));
  });
});
