import { describe, expect, test } from 'bun:test';
import { AwaitingBus, MemoryLogger, useTempDir } from 'dmg-core/testing';
import { ExampleApp } from 'dmg-core/testing/example';
import { ExampleUiSetDef, OWNER, TASK_A } from '../../testing/example';
import { T0 } from '../../testing/ui-server-fixture';
import { ApiAppDispatch } from './api-app-dispatch';
import { UiServer } from './ui-server';

// Бэкенд вызова UC сервера — `ApiApp` в процессе; ответ сессии — `SerializedResult`.

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
      module: 'todo',
      uc: 'createTask',
      input: { title: 'Хлеб' },
      requestId: 'r-1',
    });

    expect(res).toEqual({ ok: true, value: { taskId: expect.any(String) } });
  });

  test('отказ UC — ошибка в форме транспорта: код, вид, payload', async () => {
    const res = await appSession().call({
      module: 'todo',
      uc: 'completeTask',
      input: { taskId: TASK_A },
      requestId: 'r-1',
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
