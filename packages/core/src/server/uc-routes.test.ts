import { describe, expect, test } from 'bun:test';
import { UseCaseDef } from 'dmg-core';
import { ModuleApi } from 'dmg-core/app';
import { AwaitingBus, MemoryLogger } from 'dmg-core/testing';
import {
  ListTasksUcDef,
  RemoveUserUcDef,
  TodoModuleDef,
  UsersModuleDef,
} from 'dmg-core/testing/example';
import * as v from 'valibot';
import { ExampleUiSetDef, OWNER } from '../../testing/ui-fixture';
import { LIST_ID, requestTrace } from '../../testing/ui-runtime-fixture';
import {
  StubCallerSource,
  StubTransport,
} from '../../testing/ui-server-fixture';
import { ModuleApiDispatch } from './module-api-dispatch';
import { UiServer } from './ui-server';

// Маршрут вызова на сервере: имя UC → Def внутри объявленного узлом,
// модуль — по `DefIndex`. Проверяется через сессию сервера: `UcRoutes`
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

const call = (node: string, uc: string) => ({
  node,
  uc,
  input: {},
  trace: requestTrace('r-call'),
});

describe('UcRoutes — маршрут UC узла', () => {
  test('имя UC экрана — команда модулю UC', async () => {
    const { transport, session } = setup();

    await session.call(call(LIST_ID, 'listTasks'));

    expect(transport.sent).toMatchObject([
      { module: 'todo', command: { uc: 'listTasks', input: {} } },
    ]);
  });

  test('UC узла канала — модуль по DefIndex, а не модуль экранов', async () => {
    const { transport, session } = setup([
      { id: NODE, uses: [RemoveUserUcDef], listens: [] },
    ]);

    await session.call(call(NODE, 'removeUser'));

    expect(transport.sent).toMatchObject([
      { module: 'users', command: { uc: 'removeUser' } },
    ]);
  });

  test('UC, не объявленный узлом, — OPERATION_NOT_FOUND и warn, диспетчер не вызван', async () => {
    const { logger, transport, session } = setup();

    const res = await session.call(call(LIST_ID, 'getTask'));

    expect(res.ok ? undefined : res.error.code).toBe('OPERATION_NOT_FOUND');
    expect(transport.sent).toEqual([]);
    expect(logger.records.map((r) => r.level)).toEqual(['warn']);
  });

  test('неизвестный узел — OPERATION_NOT_FOUND и warn, диспетчер не вызван', async () => {
    const { logger, transport, session } = setup();

    const res = await session.call(call('exampleUi/todo/missing', 'listTasks'));

    expect(res.ok ? undefined : res.error.code).toBe('OPERATION_NOT_FOUND');
    expect(transport.sent).toEqual([]);
    expect(logger.records.map((r) => r.level)).toEqual(['warn']);
  });

  test('два одноимённых UC в узле — бросок с именем UC', () => {
    const twin = UseCaseDef.define({
      name: 'listTasks',
      label: 'Двойник',
      description: 'Другой UC с тем же именем.',
      type: 'query',
      aggregate: ListTasksUcDef.aggregate,
      callers: ['user'],
      policy: ListTasksUcDef.policy,
      input: v.object({}),
      output: v.object({}),
      errors: [],
    });

    expect(() =>
      setup([{ id: NODE, uses: [ListTasksUcDef, twin], listens: [] }]),
    ).toThrow('listTasks');
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
