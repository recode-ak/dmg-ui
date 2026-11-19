import { describe, expect, it } from 'bun:test';
import { type Command, type PersonCaller, SystemCaller } from 'dmg-core';
import {
  AwaitingBus,
  expectErr,
  expectOk,
  MemoryLogger,
  testTrace,
  testUuid,
  useTempDir,
} from 'dmg-core/testing';
import {
  CreateTaskUcDef,
  ExampleApp,
  type ExampleUser,
  GetTaskUcDef,
  ListTasksUcDef,
  TaskAr,
  TodoModuleDef,
} from 'dmg-core/testing/example';

// Прототип «домен на клиенте» (D-UI-93, D-72): сервер отдаёт state, «провод»
// (JSON) его не меняет, клиент собирает Ar. Решения Policy и правил — в тестах
// `Availability` и в приёмке доступности, не здесь. Тест платформы, а не кода
// пакета: осознанное отклонение от TST-09, как в `dmg-core-example.test.ts`.
// Ar приходит со стабильного входа `dmg-core/testing/example`.

const OWNER = testUuid(1);
const OTHER = testUuid(2);
const tmp = useTempDir('client-domain-');

type TodoUseCase = (typeof TodoModuleDef)['useCases'][number];

/** Система «от имени» человека; без человека `canManage` у `getTask` отказывает. */
const system = (origin?: PersonCaller<ExampleUser>) =>
  new SystemCaller<ExampleUser>(
    { kind: 'app', module: 'test', name: 'client-domain' },
    origin,
  );

/** Сервер с тремя открытыми задачами владельца; `call` — вызов от имени uuid. */
async function scene() {
  const app = new ExampleApp(
    { mode: 'test', dataDir: tmp().path, users: [OWNER, OTHER] },
    { bus: new AwaitingBus(), logger: new MemoryLogger(), clock: () => 1 },
  );
  const call = async <D extends TodoUseCase>(uuid: string, uc: Command<D>) =>
    app.api.dispatch(
      TodoModuleDef,
      uc,
      expectOk(await app.callers.resolve(uuid, testTrace())),
      testTrace(),
    );
  const ids: string[] = [];
  for (const title of ['Хлеб', 'Молоко', 'Сыр']) {
    const created = await call(OWNER, CreateTaskUcDef.command({ title }));
    ids.push(expectOk(created).taskId);
  }
  return { app, call, ids };
}

/** Выход `listTasks` владельца, как он уходит по сети: строка после JSON (шаги 1–2). */
async function rowsOnWire() {
  const { call } = await scene();
  const list = expectOk(await call(OWNER, ListTasksUcDef.command({})));
  const rows = list.map((row) => JSON.parse(JSON.stringify(row)));
  return { rows };
}

describe('домен на клиенте: сервер → провод → клиент', () => {
  it('строка выхода listTasks — state: Ar.readonly её восстанавливает', async () => {
    const { rows } = await rowsOnWire();
    const task = TaskAr.readonly(rows[0]);

    expect(task.isOwnedBy(OWNER)).toBe(true);
    expect(task.isOpen()).toBe(true);
    expect(rows.map((row) => row.title).sort()).toEqual([
      'Молоко',
      'Сыр',
      'Хлеб',
    ]);
  });

  it('getTask от SystemCaller без человека — ACCESS_DENIED: canManage требует субъекта', async () => {
    const { app, ids } = await scene();
    const query = GetTaskUcDef.command({ taskId: ids[0] ?? '' });
    const result = await app.api.dispatch(
      TodoModuleDef,
      query,
      system(),
      testTrace(),
    );

    expectErr(result, 'ACCESS_DENIED');
  });
});
