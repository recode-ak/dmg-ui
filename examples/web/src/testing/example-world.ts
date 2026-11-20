import { AwaitingBus, MemoryLogger } from 'dmg-core/testing';
import { ExampleApp, type ExampleUser } from 'dmg-core/testing/example';
import type { UiFault } from 'dmg-ui';
import {
  ApiAppDispatch,
  type UcDispatch,
  UiNotifier,
  UiServer,
} from 'dmg-ui/server';
import {
  ExampleUiSetDef,
  exampleCodes,
  MemoryUiObserver,
} from 'dmg-ui/testing';
import { T0 } from 'dmg-ui/testing/fixtures';
import {
  type ClientEnd,
  PageClient,
  type PageHistoryPort,
  PageHost,
  type PageStepPlace,
  PageWire,
} from 'dmg-ui/web-ui';
import {
  ExamplePagesUiAppDef,
  examplePagesRoutes,
  exampleSubjectWire,
} from 'dmg-ui/web-ui/testing';
import { EXAMPLE_PEOPLE } from '../common/example-people.const';
import { PLACES } from '../server/example-web.const';
import { exampleWebPlacements } from '../view/example-web.placements';

// Мир для тестов моделей представлений: учебное приложение во временном
// каталоге, сервер UI, хост канала, уведомитель и вкладки на проводе в
// памяти (без сети и без браузера). Те же люди и те же размещения экранов,
// что у примера.

/** Человек примера по ключу; нет — бросок теста. */
export const personOf = (key: string) => {
  const person = EXAMPLE_PEOPLE.find((candidate) => candidate.key === key);
  if (person === undefined) throw new Error(`нет человека ${key}`);
  return person;
};

/** Пропуска миров: Анна и Борис. */
export const TOKEN_ANNA = 'tA';
export const TOKEN_BORIS = 'tB';

/** Обёртка бэкенда вызова UC для сервера UI: подмена исполнения (удержание ответа). */
export type DispatchWrap = (
  inner: UcDispatch<ExampleUser>,
) => UcDispatch<ExampleUser>;

/** Приложение, сервер UI, хост и уведомитель над каталогом данных `dataDir`. */
export const exampleWorld = (dataDir: string, wrap?: DispatchWrap) => {
  const bus = new AwaitingBus();
  const context = { bus, logger: new MemoryLogger() };
  const anna = personOf('anna');
  const boris = personOf('boris');
  const example = new ExampleApp(
    { mode: 'test', dataDir, users: [anna.uuid, boris.uuid] },
    { ...context, clock: () => T0 },
  );
  const dispatch = new ApiAppDispatch(example.api);
  const server = new UiServer({
    set: ExampleUiSetDef,
    dispatch: wrap === undefined ? dispatch : wrap(dispatch),
    context,
  });
  const tokens = new Map([
    [TOKEN_ANNA, anna.uuid],
    [TOKEN_BORIS, boris.uuid],
  ]);
  const host = new PageHost({
    app: ExamplePagesUiAppDef,
    server,
    tokens: async (token) => tokens.get(token),
    callers: example.callers,
    places: PLACES,
    logger: context.logger,
    subjectToWire: exampleSubjectWire.toWire,
  });
  new UiNotifier({
    app: ExamplePagesUiAppDef,
    codes: exampleCodes(),
    dispatch,
    callers: example.callers,
    delivery: host.delivery,
    observer: new MemoryUiObserver(),
    context,
  }).start();
  return { bus, host };
};

export type ExampleWorld = ReturnType<typeof exampleWorld>;

/** Необязательная сборка вкладки: история и правило шага приложения (по умолчанию — без истории и с правилом ядра). */
export type OpenTabOptions = {
  readonly history?: PageHistoryPort;
  readonly stepPlace?: PageStepPlace;
};

/** Вкладка человека: свой провод (журнал), конец провода и клиент с теми же настройками, что у примера. */
export const openTab = async (
  world: ExampleWorld,
  token: string,
  prefix: string,
  faults?: (fault: UiFault) => void,
  options: OpenTabOptions = {},
) => {
  const wire = new PageWire(world.host);
  const connected = await wire.connect(token);
  if (!connected.ok) throw new Error(`connect(${token}): отказ`);
  const end: ClientEnd = connected.value;
  let requests = 0;
  const client = new PageClient({
    app: ExamplePagesUiAppDef,
    codes: exampleCodes(),
    routes: examplePagesRoutes,
    end,
    placements: exampleWebPlacements,
    observer: new MemoryUiObserver(),
    reviveSubject: exampleSubjectWire.revive,
    ...(faults === undefined ? {} : { faults }),
    ...(options.history === undefined ? {} : { history: options.history }),
    ...(options.stepPlace === undefined
      ? {}
      : { stepPlace: options.stepPlace }),
    requestIds: () => {
      requests += 1;
      return `${prefix}-${requests}`;
    },
  });
  return { wire, end, client };
};

export type ExampleTab = Awaited<ReturnType<typeof openTab>>;

/** Шина доставила, провода тихи: полный круг без новых сообщений (без таймеров). */
export const settle = async (world: ExampleWorld, ...tabs: ExampleTab[]) => {
  const size = () => tabs.reduce((n, tab) => n + tab.wire.messages.length, 0);
  let seen = -1;
  while (seen !== size()) {
    seen = size();
    await world.bus.delivered();
    for (const tab of tabs) await tab.wire.settled();
  }
};

/** Отдаёт микрозадачи без таймеров. */
export const flush = async () => {
  for (let turn = 0; turn < 200; turn += 1) await Promise.resolve();
};
