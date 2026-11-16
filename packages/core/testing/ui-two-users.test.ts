import { describe, expect, test } from 'bun:test';
import {
  AwaitingBus,
  MemoryLogger,
  testUuid,
  useTempDir,
} from 'dmg-core/testing';
import { ExampleApp } from 'dmg-core/testing/example';
import * as v from 'valibot';
import type { ScreenInstance } from '../src/runtime/screen-instance';
import { ScreenRuntime } from '../src/runtime/screen-runtime';
import { ApiAppDispatch } from '../src/server/api-app-dispatch';
import { UiNotifier } from '../src/server/ui-notifier';
import { UiServer } from '../src/server/ui-server';
import {
  ExampleUiAppDef,
  ExampleUiSetDef,
  TaskCardScreenDef,
  TaskListScreenDef,
} from './ui-fixture';
import {
  fixtureCodes,
  MemoryUiObserver,
  RuntimeKit,
  requestTrace,
} from './ui-runtime-fixture';
import { oplogRecords, StubDelivery, T0 } from './ui-server-fixture';

// Сквозной тест ядра (TST-09 — единственный): только объявленное, перечитывание
// по своему событию с причиной-событием в логе операций. Учебное
// приложение, сервер UI и два исполнителя — пользователи A и B. Данные — во
// временном каталоге.

const A = testUuid(1);
const B = testUuid(2);
const tmp = useTempDir('dmg-ui-two-users-');
const Created = v.object({ taskId: v.string() });

/** Приложение, сервер, уведомитель и по исполнителю на пользователя. */
const world = () => {
  const bus = new AwaitingBus();
  const context = { bus, logger: new MemoryLogger() };
  const example = new ExampleApp(
    { mode: 'test', dataDir: tmp().path, users: [A, B] },
    { ...context, clock: () => T0 },
  );
  const dispatch = new ApiAppDispatch(example.api);
  const server = new UiServer({ set: ExampleUiSetDef, dispatch, context });
  const codes = fixtureCodes();
  const delivery = new StubDelivery();
  const observer = new MemoryUiObserver();
  new UiNotifier({
    app: ExampleUiAppDef,
    codes,
    dispatch,
    callers: example.callers,
    delivery,
    observer,
    context,
  }).start();
  const runtimeOf = (uuid: string) => {
    const session = server.session({
      subjectId: uuid,
      resolve: (trace) => example.callers.resolve(uuid, trace),
    });
    return new ScreenRuntime({
      set: ExampleUiSetDef,
      codes,
      ucs: session,
      refresh: session,
      observer,
    });
  };
  return { bus, delivery, a: runtimeOf(A), b: runtimeOf(B) };
};

type World = ReturnType<typeof world>;

const openList = (runtime: ScreenRuntime, requestId: string) =>
  runtime.open(
    TaskListScreenDef.at({ index: 0 }),
    RuntimeKit.options({}, requestId),
  );

const nextChange = (instance: ScreenInstance) =>
  new Promise<void>((resolve) => instance.onChange(resolve));

/** A создаёт задачу с отдельного экземпляра списка; возвращает её id. */
const createAsA = async (w: World) => {
  const form = await openList(w.a, 'r-form-a');
  const outcome = await form.act({
    action: 'create',
    input: { title: 'Хлеб' },
    revision: 1,
    trace: requestTrace('r-create'),
  });
  await w.bus.delivered();
  if (outcome.kind !== 'exited') throw new Error(`создание: ${outcome.kind}`);
  return v.parse(Created, outcome.data).taskId;
};

/** A назначает задачу B с карточки. */
const assignToB = async (w: World, taskId: string) => {
  const card = await w.a.open(
    TaskCardScreenDef.at({ taskId }),
    RuntimeKit.options({}, 'r-card-a'),
  );
  await card.act({
    action: 'assign',
    input: { assigneeId: B },
    revision: 1,
    trace: requestTrace('r-assign'),
  });
  await w.bus.delivered();
};

const ReadRecord = v.object({
  op: v.literal('listTasks'),
  caller: v.object({ subjectId: v.string() }),
  trace: v.object({
    cause: v.object({ kind: v.string() }),
    correlationId: v.string(),
  }),
});

/** Записи `listTasks` субъекта `uuid` в логе операций: `<вид причины>:<цепочка>`. */
const listReads = (uuid: string) =>
  oplogRecords(tmp().path)
    .filter((r) => v.is(ReadRecord, r))
    .map((r) => v.parse(ReadRecord, r))
    .filter((r) => r.caller.subjectId === uuid)
    .map(({ trace }) => `${trace.cause.kind}:${trace.correlationId}`);

describe('два пользователя: сервер UI и исполнители', () => {
  test('событие перечитывает только экран автора; уведомление — только получателю, от его имени', async () => {
    const w = world();
    const listA = await openList(w.a, 'r-open-a');
    const listB = await openList(w.b, 'r-open-b');
    const reread = nextChange(listA);

    const taskId = await createAsA(w);
    await reread;
    await assignToB(w, taskId);

    expect([listA.view().revision, listB.view().revision]).toEqual([2, 1]);
    expect(listReads(A)).toContain('event:r-create');
    expect(listReads(B)).toEqual(['request:r-open-b', 'event:r-assign']);
    expect(w.delivery.delivered).toMatchObject([{ recipient: B }]);
  });
});
