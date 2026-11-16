import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Trace } from 'dmg-core/app';
import { AppGraph } from 'dmg-core/graph';
import {
  AwaitingBus,
  ExampleGraph,
  expectOk,
  MemoryLogger,
  useTempDir,
} from 'dmg-core/testing';
import {
  CreateTaskUcDef,
  ExampleApp,
  ListTasksUcDef,
  TodoModuleDef,
} from 'dmg-core/testing/example';

// Контрактный тест опоры `dmg-ui/testing` на учебное приложение `dmg-core`:
// проверяет, что в среде стоит dmg-core с входом `dmg-core/testing/example`
// и признаком `visible` (v0.5.1). Это осознанное отклонение от TST-09
// (тест не про код пакета, а про платформу), его требуют spec и план трека.

const USER_A = '5e3d1c2b-7a6f-4e8d-b9c0-a1f2e3d4c5b6';
const USER_B = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const T0 = Date.UTC(2026, 9, 1);

const tmp = useTempDir('dmg-core-example-');

async function userCaller(app: ExampleApp, uuid: string) {
  return expectOk(
    await app.callers.resolve(uuid, Trace.fromRequest({ requestId: 'r' })),
  );
}

describe('опора на dmg-core/testing/example', () => {
  it('задача пользователя A видна только ему; в oplog есть createTask', async () => {
    const app = new ExampleApp(
      { mode: 'test', dataDir: tmp().path, users: [USER_A, USER_B] },
      { bus: new AwaitingBus(), logger: new MemoryLogger(), clock: () => T0 },
    );
    const a = await userCaller(app, USER_A);
    const b = await userCaller(app, USER_B);

    expectOk(
      await app.api.dispatch(
        TodoModuleDef,
        CreateTaskUcDef.command({ title: 'Хлеб' }),
        a,
        Trace.fromRequest({ requestId: 'create' }),
      ),
    );

    const listOf = async (
      caller: Awaited<ReturnType<typeof userCaller>>,
      requestId: string,
    ) =>
      expectOk(
        await app.api.dispatch(
          TodoModuleDef,
          ListTasksUcDef.command({}),
          caller,
          Trace.fromRequest({ requestId }),
        ),
      );
    expect(await listOf(a, 'list-a')).toHaveLength(1);
    expect(await listOf(b, 'list-b')).toEqual([]);

    const oplog = join(tmp().path, 'oplog');
    const ops = readdirSync(oplog)
      .filter((file) => file.endsWith('.jsonl'))
      .flatMap((file) =>
        readFileSync(join(oplog, file), 'utf8').trim().split('\n'),
      )
      .map((line) => JSON.parse(line).op);
    expect(ops).toContain('createTask');
  });

  it('граф учебного приложения: четыре UC todo с visible: true', () => {
    const graph = new AppGraph(ExampleGraph).build();

    for (const uc of [
      'createTask',
      'completeTask',
      'listTasks',
      'assignTask',
    ]) {
      expect(graph.node(`example/todo/${uc}`)?.visible).toBe(true);
    }
  });
});
