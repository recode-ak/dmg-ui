import { expect, test } from 'bun:test';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  AwaitingBus,
  MemoryLogger,
  testTrace,
  testUuid,
  useTempDir,
} from 'dmg-core/testing';
import {
  ExampleApp,
  ListTasksUcDef,
  TodoModuleDef,
} from 'dmg-core/testing/example';
import { ApiAppDispatch, UiNotifier, UiServer } from 'dmg-ui/server';
import {
  ExamplePagesAppDef,
  examplePageRoutes,
  examplePageViews,
} from './example/pages';
import {
  type Dialog,
  DialogChannel,
  ExampleDialogAppDef,
  ExampleUiSetDef,
  exampleCodes,
  exampleDialogViews,
  MemoryUiObserver,
} from './index';
import { PageClient } from './page/client/page-client';
import { PageHost } from './page/server/page-host';
import { PageWire } from './page/wire/page-wire';
import { T0 } from './ui-server-fixture';

// Приёмка нейтральности ядра: один сценарий сторис
// `finishTasks` — создать задачу, открыть карточку, выполнить — на двух
// каналах, диалоговом и страничном, над одним кодом, экранами и сторис.
// Лог операций не сравнивается: страничный канал держит открытым и
// перечитывает список.

const A = testUuid(1);
const TITLE = 'Хлеб';
const tmp = useTempDir('dmg-ui-channels-story-');

/** Общий мир канала: приложение примера, сервер UI, шина и наблюдатель. */
const base = (name: string) => {
  const bus = new AwaitingBus();
  const context = { bus, logger: new MemoryLogger() };
  const example = new ExampleApp(
    { mode: 'test', dataDir: join(tmp().path, name), users: [A] },
    { ...context, clock: () => T0 },
  );
  const dispatch = new ApiAppDispatch(example.api);
  const server = new UiServer({ set: ExampleUiSetDef, dispatch, context });
  return {
    bus,
    context,
    example,
    dispatch,
    server,
    observer: new MemoryUiObserver(),
  };
};

/** Идентификаторы запросов `r-1`, `r-2`, …: повтор того же отсеивается. */
const counter = () => {
  let n = 0;
  return () => {
    n += 1;
    return `r-${n}`;
  };
};

/** Итоговое состояние задач A в приложении: название и статус. */
const tasksOf = async (example: ExampleApp) => {
  const caller = await example.callers.resolve(A, testTrace());
  if (!caller.ok) throw new Error('вызывающий A не найден');
  const result = await example.api.dispatch(
    TodoModuleDef,
    ListTasksUcDef.command({}),
    caller.value,
    testTrace(),
  );
  if (!result.ok) throw new Error('listTasks: отказ');
  return result.value.map((t) => ({ title: t.title, status: t.status }));
};

const pressLabel = (dialog: Dialog, label: string) => {
  for (const reply of [...dialog.replies].reverse()) {
    const option = reply.options.find((o) => o.label === label);
    if (option !== undefined) return dialog.press(option.ref);
  }
  throw new Error(`нет варианта «${label}»`);
};

/** Сценарий на диалоговом канале. */
const onDialog = async () => {
  const w = base('dialog');
  const codes = exampleCodes();
  const channel = new DialogChannel({
    app: ExampleDialogAppDef,
    codes,
    server: w.server,
    views: exampleDialogViews,
    observer: w.observer,
    identities: () => w.example.callers,
    requestIds: counter(),
  });
  new UiNotifier({
    app: ExampleDialogAppDef,
    codes,
    dispatch: w.dispatch,
    callers: w.example.callers,
    delivery: channel.delivery,
    observer: w.observer,
    context: w.context,
  }).start();
  const a = channel.person(A);
  await a.start('start');
  await a.say(TITLE);
  await pressLabel(a, 'Открыть задачу');
  await pressLabel(a, TITLE);
  await pressLabel(a, 'Выполнить');
  await w.bus.delivered();
  return w;
};

/** Сценарий на страничном канале. */
const onPages = async () => {
  const w = base('pages');
  const codes = exampleCodes();
  const tokens = new Map([['tA', A]]);
  const host = new PageHost({
    app: ExamplePagesAppDef,
    server: w.server,
    tokens: (token) => tokens.get(token),
    identities: () => w.example.callers,
    logger: w.context.logger,
  });
  new UiNotifier({
    app: ExamplePagesAppDef,
    codes,
    dispatch: w.dispatch,
    callers: w.example.callers,
    delivery: host.delivery,
    observer: w.observer,
    context: w.context,
  }).start();
  const wire = new PageWire(host);
  const connected = await wire.connect('tA');
  if (!connected.ok) throw new Error('connect(tA): отказ');
  const client = new PageClient({
    app: ExamplePagesAppDef,
    codes,
    views: examplePageViews,
    routes: examplePageRoutes,
    end: connected.value,
    observer: w.observer,
    requestIds: counter(),
  });
  await client.route('/');
  await client.submit('main', 'create', { title: TITLE });
  await client.submit('main', 'open', { taskId: TITLE });
  await client.submit('side', 'complete', {});
  await w.bus.delivered();
  await wire.settled();
  return w;
};

/** Проекция записей исходов: то, что обязано совпасть у каналов. */
const outcomes = (observer: MemoryUiObserver) =>
  observer.records.flatMap((r) =>
    r.kind === 'outcome'
      ? [{ node: r.node, outcome: r.outcome, to: r.to, exit: r.exit }]
      : [],
  );

/** Файлы каталога привязки, которые принадлежат только примеру. */
const exampleOnly = (dir: string) =>
  readdirSync(join(import.meta.dir, 'example', dir)).filter((name) =>
    /\.(code|screen|story)\.ts$/.test(name),
  );

test('сторис finishTasks: записи исходов наблюдателя двух каналов равны', async () => {
  const dialog = await onDialog();
  const pages = await onPages();
  const expected = outcomes(dialog.observer);
  expect(expected.length).toBeGreaterThan(0);
  expect(outcomes(pages.observer)).toEqual(expected);
});

test('сторис finishTasks: итоговое состояние задачи на двух каналах одно', async () => {
  const dialog = await onDialog();
  const pages = await onPages();
  const expected = [{ title: TITLE, status: 'done' as const }];
  expect(await tasksOf(dialog.example)).toEqual(expected);
  expect(await tasksOf(pages.example)).toEqual(expected);
});

test('приложения каналов делят сторис и набор', () => {
  expect(ExamplePagesAppDef.stories).toHaveLength(
    ExampleDialogAppDef.stories.length,
  );
  expect(
    ExamplePagesAppDef.stories.every(
      (story, index) => story === ExampleDialogAppDef.stories[index],
    ),
  ).toBe(true);
  expect(ExamplePagesAppDef.set).toBe(ExampleDialogAppDef.set);
});

test('в привязках каналов нет кода, экранов и сторис примера', () => {
  expect(exampleOnly('dialog')).toEqual([]);
  expect(exampleOnly('pages')).toEqual([]);
});
