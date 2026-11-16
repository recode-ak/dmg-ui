import { describe, expect, test } from 'bun:test';
import { AppDef, ModuleDef, type SerializedResult, UseCaseDef } from 'dmg-core';
import { ModuleApi } from 'dmg-core/app';
import { AwaitingBus, MemoryLogger } from 'dmg-core/testing';
import {
  ListTasksUcDef,
  RemoveUserUcDef,
  TodoModuleDef,
  UsersModuleDef,
} from 'dmg-core/testing/example';
import * as v from 'valibot';
import { ExampleUiSetDef, LIST_ID, OWNER } from '../../testing/example';
import { TodoUiModuleDef } from '../../testing/example/todo/todo.ui-module';
import {
  StubCallerSource,
  StubTransport,
} from '../../testing/ui-server-fixture';
import { UiSetDef } from '../manifest/ui-set-def';
import { ModuleApiDispatch } from './module-api-dispatch';
import { UiServer } from './ui-server';

// Маршрут вызова на сервере: пара (модуль, UC) → Def в объединении объявленного
// экранами и узлами канала; модуль сверяется по `DefIndex`. Проверяется через сессию сервера: `UcRoutes`
// собирает `UiServer`.

const NODE = 'testChannel/join';

type Nodes = ConstructorParameters<typeof UiServer>[0]['nodes'];

const setup = (nodes: Nodes = []) => {
  const logger = new MemoryLogger();
  const transport = new StubTransport();
  const apis = [TodoModuleDef, UsersModuleDef].map(
    (def) => new ModuleApi(def, transport, logger),
  );
  const server = new UiServer({
    set: ExampleUiSetDef,
    dispatch: new ModuleApiDispatch(apis),
    context: { bus: new AwaitingBus(), logger },
    nodes,
  });
  const session = server.session(new StubCallerSource(OWNER));
  return { logger, transport, session };
};

const call = (module: string, uc: string) => ({
  module,
  uc,
  input: {},
  requestId: 'r-call',
});

/** Отказ вызова: код и payload ошибки; успех — `undefined`. */
const refusal = (res: SerializedResult) => (res.ok ? undefined : res.error);

/** Query-UC `name` своего модуля: тот же агрегат, что у `listTasks`. */
const queryUc = (name: string) =>
  UseCaseDef.define({
    name,
    label: 'Запрос',
    description: 'UC с заданным именем для проверки маршрута.',
    type: 'query',
    aggregate: ListTasksUcDef.aggregate,
    callers: ['user'],
    policy: ListTasksUcDef.policy,
    input: v.object({}),
    output: v.object({}),
    errors: [],
  });

describe('UcRoutes — маршрут UC по паре (module, uc)', () => {
  test('UC экрана — команда модулю UC', async () => {
    const { transport, session } = setup();

    await session.call(call('todo', 'listTasks'));

    expect(transport.sent).toMatchObject([
      { module: 'todo', command: { uc: 'listTasks', input: {} } },
    ]);
  });

  test('UC узла канала — модуль по DefIndex, узла в вызове нет', async () => {
    const { transport, session } = setup([
      { id: NODE, uses: [RemoveUserUcDef], listens: [] },
    ]);

    await session.call(call('users', 'removeUser'));

    expect(transport.sent).toMatchObject([
      { module: 'users', command: { uc: 'removeUser' } },
    ]);
  });

  test('один UC в экране и в узле канала — один маршрут, вызов исполнен', async () => {
    const { transport, session } = setup([
      { id: NODE, uses: [ListTasksUcDef], listens: [] },
    ]);

    const res = await session.call(call('todo', 'listTasks'));

    expect(res.ok).toBe(true);
    expect(transport.names()).toEqual(['listTasks']);
  });

  test('UC, не объявленный ни экраном, ни узлом, — OPERATION_NOT_FOUND с настоящим модулем и warn', async () => {
    const { logger, transport, session } = setup();

    const res = await session.call(call('todo', 'getTask'));

    expect(refusal(res)).toMatchObject({
      code: 'OPERATION_NOT_FOUND',
      payload: { module: 'todo', uc: 'getTask' },
    });
    expect(transport.sent).toEqual([]);
    expect(logger.records.map((r) => r.level)).toEqual(['warn']);
  });

  test('UC уведомления (getTaskAssignee) недоступен сессии — OPERATION_NOT_FOUND { module: todo, uc }', async () => {
    const { transport, session } = setup();

    const res = await session.call(call('todo', 'getTaskAssignee'));

    expect(refusal(res)).toMatchObject({
      code: 'OPERATION_NOT_FOUND',
      payload: { module: 'todo', uc: 'getTaskAssignee' },
    });
    expect(transport.sent).toEqual([]);
  });

  test('имя UC верное, модуль чужой — OPERATION_NOT_FOUND, диспетчер не вызван', async () => {
    const { logger, transport, session } = setup();

    const res = await session.call(call('users', 'listTasks'));

    expect(refusal(res)).toMatchObject({
      code: 'OPERATION_NOT_FOUND',
      payload: { module: 'users', uc: 'listTasks' },
    });
    expect(transport.sent).toEqual([]);
    expect(logger.records.map((r) => r.level)).toEqual(['warn']);
  });

  test('неизвестный модуль — OPERATION_NOT_FOUND с этим модулем, диспетчер не вызван', async () => {
    const { logger, transport, session } = setup();

    const res = await session.call(call('missing', 'listTasks'));

    expect(refusal(res)).toMatchObject({
      code: 'OPERATION_NOT_FOUND',
      payload: { module: 'missing', uc: 'listTasks' },
    });
    expect(transport.sent).toEqual([]);
    expect(logger.records.map((r) => r.level)).toEqual(['warn']);
  });

  test('одноимённые UC двух модулей различаются модулем вызова', async () => {
    const twin = queryUc('listTasks');
    const sibling = ModuleDef.define({
      name: 'sibling',
      label: 'Сосед',
      description: 'Модуль с UC, одноимённым UC модуля todo.',
      dependsOn: [],
      aggregates: [ListTasksUcDef.aggregate],
      useCases: [twin],
      reactions: [],
      jobs: [],
    });
    const logger = new MemoryLogger();
    const transport = new StubTransport();
    const server = new UiServer({
      set: UiSetDef.define({
        name: 'siblingUi',
        label: 'UI с двумя модулями',
        description: 'Набор UI с одноимёнными UC разных модулей.',
        app: AppDef.define({
          name: 'sibling',
          label: 'Приложение',
          description: 'Приложение с одноимёнными UC.',
          modules: [TodoModuleDef, UsersModuleDef, sibling],
        }),
        modules: [TodoUiModuleDef],
      }),
      dispatch: new ModuleApiDispatch(
        [TodoModuleDef, UsersModuleDef, sibling].map(
          (def) => new ModuleApi(def, transport, logger),
        ),
      ),
      context: { bus: new AwaitingBus(), logger },
      nodes: [{ id: NODE, uses: [twin], listens: [] }],
    });
    const session = server.session(new StubCallerSource(OWNER));

    await session.call(call('todo', 'listTasks'));
    await session.call(call('sibling', 'listTasks'));

    expect(transport.sent.map((s) => s.module)).toEqual(['todo', 'sibling']);
  });

  test('два одноимённых UC одного модуля в узле — бросок с модулем и именем UC', () => {
    const first = queryUc('listTasks');
    const second = queryUc('listTasks');
    const twins = ModuleDef.define({
      name: 'twins',
      label: 'Двойники',
      description: 'Модуль с двумя UC одного имени.',
      dependsOn: [],
      aggregates: [ListTasksUcDef.aggregate],
      useCases: [first, second],
      reactions: [],
      jobs: [],
    });
    const logger = new MemoryLogger();
    const build = () =>
      new UiServer({
        set: UiSetDef.define({
          name: 'twinsUi',
          label: 'UI с двойниками',
          description: 'Набор UI с одноимёнными UC одного модуля.',
          app: AppDef.define({
            name: 'twins',
            label: 'Приложение',
            description: 'Приложение с одноимёнными UC одного модуля.',
            modules: [TodoModuleDef, UsersModuleDef, twins],
          }),
          modules: [TodoUiModuleDef],
        }),
        dispatch: new ModuleApiDispatch([]),
        context: { bus: new AwaitingBus(), logger },
        nodes: [{ id: NODE, uses: [first, second], listens: [] }],
      });

    expect(build).toThrow('в модуле twins два UC с именем listTasks');
  });

  test('узел канала с id экрана — бросок с id узла', () => {
    expect(() =>
      setup([{ id: LIST_ID, uses: [ListTasksUcDef], listens: [] }]),
    ).toThrow(LIST_ID);
  });

  test('UC вне модулей приложения — бросок с именем UC', () => {
    const stray = UseCaseDef.define({
      name: 'strayQuery',
      label: 'Чужой',
      description: 'UC, которого нет ни в одном модуле приложения.',
      type: 'query',
      aggregate: ListTasksUcDef.aggregate,
      callers: ['user'],
      policy: ListTasksUcDef.policy,
      input: v.object({}),
      output: v.object({}),
      errors: [],
    });

    expect(() => setup([{ id: NODE, uses: [stray], listens: [] }])).toThrow(
      'strayQuery',
    );
  });
});
