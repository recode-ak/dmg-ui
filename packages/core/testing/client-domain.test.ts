import { describe, expect, it } from 'bun:test';
import {
  type Command,
  denied,
  ErrorText,
  type PersonCaller,
  SystemCaller,
} from 'dmg-core';
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
  CompleteTaskUcDef,
  CreateTaskUcDef,
  ExampleApp,
  type ExampleUser,
  GetTaskUcDef,
  ListTasksUcDef,
  TodoModuleDef,
} from 'dmg-core/testing/example';
import {
  OPEN_TASKS_LIMIT,
  TaskAr,
  TaskPolicy,
  TaskRules,
} from 'dmg-core/testing/example/todo/index';

// Прототип «домен на клиенте» (D-UI-93, D-72): сервер отдаёт state, «провод»
// (JSON) его не меняет, клиент собирает Ar и сам считает Policy и правила.
// Тест платформы, а не кода пакета: осознанное отклонение от TST-09, как в
// `dmg-core-example.test.ts`. Глубокий путь Ar/Policy/Rules: их нет на
// стабильном входе `dmg-core/testing/example`.

const OWNER = testUuid(1);
const OTHER = testUuid(2);
const ADMIN = testUuid(3);
const tmp = useTempDir('client-domain-');

type Wire = { uuid: string; roles: string[] };
/** Клиентское восстановление субъекта (`revive` проекта) по wire `{uuid, roles}`. */
const revive = (wire: Wire): ExampleUser => ({
  uuid: wire.uuid,
  hasRole: (role) => wire.roles.includes(role),
});

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

/** Состояние задач, как оно уходит по сети: строка после JSON (шаги 1–2). */
async function rowsOnWire() {
  const { app, call, ids } = await scene();
  const owner = expectOk(await app.callers.resolve(OWNER, testTrace()));
  const rows = [];
  for (const taskId of ids) {
    const query = GetTaskUcDef.command({ taskId });
    const state = expectOk(
      await app.api.dispatch(TodoModuleDef, query, system(owner), testTrace()),
    );
    rows.push(JSON.parse(JSON.stringify(state)));
  }
  return { rows, call, ids };
}

describe('домен на клиенте: сервер → провод → клиент', () => {
  it('state с сервера после JSON восстанавливается в Ar', async () => {
    const { rows } = await rowsOnWire();
    const task = TaskAr.readonly(rows[0]);

    expect(task.isOwnedBy(OWNER)).toBe(true);
    expect(task.isOpen()).toBe(true);
  });

  it('canManage: владелец и администратор — allowed, чужой — denied с текстом', async () => {
    const { rows } = await rowsOnWire();
    const ctx = { task: TaskAr.readonly(rows[0]) };
    const decide = (wire: Wire) =>
      TaskPolicy.rules.canManage.evaluate(revive(wire), ctx);

    expect(decide({ uuid: OWNER, roles: [] }).allowed).toBe(true);
    expect(decide({ uuid: ADMIN, roles: ['admin'] }).allowed).toBe(true);
    expect(decide({ uuid: OTHER, roles: [] })).toEqual(
      denied(
        'canManage',
        'Управлять задачей может владелец или администратор.',
      ),
    );
  });

  it('withinOpenLimit: три открытых — TASK_TOO_MANY_OPEN с читаемым текстом', async () => {
    const { rows } = await rowsOnWire();
    const ownerTasks = rows.map((row) => TaskAr.readonly(row));
    const error = expectErr(
      TaskRules.rules.withinOpenLimit.check({ ownerTasks }),
      'TASK_TOO_MANY_OPEN',
    );

    expect(rows).toHaveLength(OPEN_TASKS_LIMIT);
    expect(error.payload).toEqual({ limit: OPEN_TASKS_LIMIT });
    expect(ErrorText.of(error).summary).toBe('Слишком много открытых задач');
  });

  it('смена роли: другой revive — другое решение на той же задаче', async () => {
    const { rows } = await rowsOnWire();
    const ctx = { task: TaskAr.readonly(rows[0]) };
    const asUser = revive({ uuid: OTHER, roles: [] });
    const asAdmin = revive({ uuid: OTHER, roles: ['admin'] });
    const { canManage } = TaskPolicy.rules;

    expect(canManage.evaluate(asUser, ctx).allowed).toBe(false);
    expect(canManage.evaluate(asAdmin, ctx).allowed).toBe(true);
  });

  it('строка выхода listTasks (3 поля) — не state: Ar.readonly бросает', async () => {
    const { call } = await scene();
    const list = expectOk(await call(OWNER, ListTasksUcDef.command({})));

    expect(Object.keys(list[0] ?? {}).sort()).toEqual([
      'status',
      'title',
      'uuid',
    ]);
    expect(() =>
      TaskAr.readonly(JSON.parse(JSON.stringify(list[0]))),
    ).toThrow();
  });

  it('сервер перепроверяет: completeTask от чужого — ACCESS_DENIED', async () => {
    const { call, ids } = await scene();
    const complete = CompleteTaskUcDef.command({
      taskId: ids[0] ?? '',
      expectedVersion: 0,
    });
    expectErr(await call(OTHER, complete), 'ACCESS_DENIED');
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
