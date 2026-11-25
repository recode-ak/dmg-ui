import { describe, expect, test } from 'bun:test';
import {
  CoreErrors,
  type DomainError,
  ErrorDef,
  ErrorText,
  err,
  F,
  ok,
  type Result,
  type SerializedResult,
} from 'dmg-core';
import { testUuid } from 'dmg-core/testing';
import {
  CompleteTaskUcDef,
  ExampleAppDef,
  ListTasksUcDef,
  TaskEvents,
} from 'dmg-core/testing/example';
import {
  type ActionSteps,
  type AnyScreenDef,
  type AnyUiSetDef,
  AppCodeLoaders,
  CodeLoader,
  CodeLoaders,
  type InstanceView,
  type LoadContext,
  ScreenCode,
  ScreenDef,
  UiAppDef,
  type UiFault,
  UiModuleDef,
  UiSetDef,
} from 'dmg-ui';
import {
  ASSIGNED_ID,
  AssignedTasksScreenDef,
  CARD_ID,
  ExamplePagesUiAppDef,
  ExampleUiSetDef,
  exampleCodes,
  examplePagesRoutes,
  FinishTasksStoryDef,
  FollowAssignedStoryDef,
  LIST_ID,
  MainMenuScreenDef,
  PlanTasksStoryDef,
  StartWorkStoryDef,
  TASK_A,
  TASK_B,
  TaskCardScreenDef,
  TaskListScreenDef,
} from 'dmg-ui/example';
import { MemoryUiObserver } from 'dmg-ui/testing';
import * as v from 'valibot';
import { ManualPageClock, MemoryPageHistory } from '../../testing';
import { examplePagesViews } from '../../testing/text-views/example-pages.views';
import { PAGE_CHANNEL } from '../page-channel.const';
import { PageFormModel } from '../view/page-form-model';
import type { PageViewState } from '../view/page-view-state.types';
import type {
  ClientMessage as ClientMsg,
  ServerMessage as ServerMsg,
} from '../wire/page-messages.types';
import type { ClientEnd } from '../wire/page-wire.types';
import { PageClient } from './page-client';
import {
  INBOX_LIMIT,
  PAGE_DEFECTS,
  PAGE_FAULTS,
  PAGE_NOTES,
  SEEN_TTL_MS,
} from './page-client.const';
import type {
  PageInboxEntry,
  PagePlacement,
  PageRegionName,
  PageSlotJson,
} from './page-client.types';
import type { PageHistoryPort } from './page-history.types';
import { PageHistoryRecord } from './page-history-record';
import { PageText } from './page-text';

// Клиентская половина страничного канала: три области (`main`, `side`,
// `modal`), политики исходов, входящие, снимок, состояния области, обрыв и смена
// конца. Сервер — заглушка конца провода: отвечает на `call` по имени UC,
// умеет сам прислать сообщение и оборваться. Ответы — микрозадачи, `flush()`
// отдаёт их без таймеров (TST-04); удержанный UC отвечает по `release`;
// время отсева — подставные часы. Текст страницы — у `PageText`, состояния —
// журнал `source(region).subscribe`.

const TASK_C = testUuid(3);
const SUBJECT_ID = testUuid(1);
const AT = Date.UTC(2026, 0, 1);

/** Строка выхода query UC — state задачи (D-UI-93): клиент считает по ней Policy и правила. */
const stateOf = (uuid: string, title: string, status: 'open' | 'done') => ({
  uuid,
  createdAt: AT,
  updatedAt: AT,
  version: 1,
  ownerId: SUBJECT_ID,
  title,
  status,
});

/** Задачи вызывающего: две открытые и выполненная — предел открытых не достигнут. */
const TASKS = [
  stateOf(TASK_A, 'Хлеб', 'open'),
  stateOf(TASK_B, 'Молоко', 'open'),
  stateOf(TASK_C, 'Сыр', 'done'),
];
const LIST = { screen: LIST_ID, params: { page: 0 } };
const ASSIGNED = { screen: ASSIGNED_ID, params: {} };
/** Субъект из `hello` — JSON проекта: `{ uuid, roles }`; владелец `TASKS`. */
const SUBJECT_WIRE = { uuid: SUBJECT_ID, roles: [] };
const CONTEXT = {
  locale: 'ru-RU',
  timeZone: 'Asia/Oral',
  delegate: false,
  readOnly: false,
  subject: SUBJECT_WIRE,
};

const SubjectWire = v.strictObject({
  uuid: v.string(),
  roles: v.array(v.string()),
});

/** Восстановление субъекта проекта из JSON `hello`: `{ uuid, hasRole }`. */
const reviveSubject = (raw: unknown) => {
  const wire = v.parse(SubjectWire, raw);
  return {
    uuid: wire.uuid,
    hasRole: (role: string) => wire.roles.includes(role),
  };
};

type Answer = SerializedResult | ((call: unknown) => SerializedResult);

/**
 * Конец провода клиента: журнал отправленного, ответы по имени UC, сообщения
 * сервера и обрыв. После обрыва отправленное — в `afterBreak`, без ответов.
 */
class StubEnd implements ClientEnd {
  readonly sent: ClientMsg[] = [];
  /** Отправленное после обрыва: клиенту слать некуда — журнал должен быть пуст. */
  readonly afterBreak: ClientMsg[] = [];
  /** Сколько раз конец оборвался — не больше одного. */
  breaks = 0;
  private readonly handlers: ((message: ServerMsg) => Promise<void> | void)[] =
    [];
  private readonly breakHandlers: ((error: Error) => void)[] = [];
  private readonly answers = new Map<string, Answer>();
  /** Удержанные UC: ответы ждут `release`. */
  private readonly held = new Map<string, (() => void)[]>();

  constructor(readonly context = CONTEXT) {}

  answer(uc: string, result: Answer): this {
    this.answers.set(uc, result);
    return this;
  }

  /** Ответы на `uc` придут только по `release(uc)`. */
  hold(uc: string): this {
    this.held.set(uc, []);
    return this;
  }

  /** Отдаёт удержанные ответы на `uc` по порядку вызовов. */
  release(uc: string): void {
    const queue = this.held.get(uc) ?? [];
    this.held.delete(uc);
    for (const reply of queue) reply();
  }

  onMessage(handler: (message: ServerMsg) => Promise<void> | void): void {
    this.handlers.push(handler);
  }

  onBreak(handler: (error: Error) => void): void {
    this.breakHandlers.push(handler);
  }

  /** Обрыв со стороны сервера: обработчики обрыва — один раз. */
  drop(error = new Error('StubEnd: связь оборвалась')): void {
    if (this.breaks > 0) return;
    this.breaks += 1;
    for (const handler of [...this.breakHandlers]) handler(error);
  }

  send(message: ClientMsg): void {
    if (this.breaks > 0) {
      this.afterBreak.push(message);
      return;
    }
    this.sent.push(message);
    if (message.kind !== 'call') return;
    const answer = this.answers.get(message.call.uc);
    if (answer === undefined) {
      throw new Error(`StubEnd: нет ответа на ${message.call.uc}`);
    }
    const reply = () =>
      this.emit({
        kind: 'result',
        id: message.id,
        result: typeof answer === 'function' ? answer(message.call) : answer,
      });
    const queue = this.held.get(message.call.uc);
    if (queue === undefined) Promise.resolve().then(reply);
    else queue.push(reply);
  }

  /** Закрытие клиентом — тоже обрыв, один раз. */
  close(): void {
    this.drop(new Error('StubEnd: соединение закрыто'));
  }

  emit(message: ServerMsg): void {
    for (const handler of this.handlers) handler(message);
  }

  /** Сообщение обработчикам; промис — их промисы, как их ждёт провод в памяти. */
  async deliver(message: ServerMsg): Promise<void> {
    await Promise.all(this.handlers.map((handler) => handler(message)));
  }

  /** Отдаёт все ответы заглушки и реакции клиента на них. */
  async flush(): Promise<void> {
    for (let turn = 0; turn < 200; turn += 1) await Promise.resolve();
  }

  /** Отправленные вызовы UC. */
  calls() {
    return this.sent.flatMap((m) => (m.kind === 'call' ? [m.call] : []));
  }

  names(): string[] {
    return this.calls().map((call) => call.uc);
  }

  watches(): string[] {
    return this.sent.flatMap((m) => (m.kind === 'watch' ? [m.watch] : []));
  }

  unwatches(): string[] {
    return this.sent.flatMap((m) => (m.kind === 'unwatch' ? [m.watch] : []));
  }
}

const denied = CoreErrors.ACCESS_DENIED.make({
  rule: 'canManageAll',
  denyMessage: 'Выполнять задачи может только владелец.',
});

const tab = (
  end = new StubEnd().answer('listTasks', ok(TASKS)),
  codes = exampleCodes({}, ExamplePagesUiAppDef),
  placements?: readonly PagePlacement[],
  history?: PageHistoryPort,
) => {
  let requests = 0;
  const observer = new MemoryUiObserver();
  const faults: UiFault[] = [];
  const clock = new ManualPageClock();
  const client = new PageClient({
    app: ExamplePagesUiAppDef,
    codes,
    routes: examplePagesRoutes,
    end,
    observer,
    clock,
    reviveSubject,
    faults: (fault) => {
      faults.push(fault);
    },
    requestIds: () => {
      requests += 1;
      return `r-${requests}`;
    },
    ...(placements === undefined ? {} : { placements }),
    ...(history === undefined ? {} : { history }),
  });
  const text = new PageText(client, examplePagesViews());
  return { client, end, observer, faults, text, clock };
};

/** Вкладка со списком в `main`. */
const listed = async (end?: StubEnd) => {
  const t = tab(end);
  await t.client.route('/');
  return t;
};

/** Код экранов, загрузку которого можно сломать: `broken` — экран `id` не грузится. */
const breakable = () => {
  const codes = exampleCodes({}, ExamplePagesUiAppDef);
  const screen = codes.screen.bind(codes);
  const broken = new Set<string>();
  codes.screen = (def) =>
    broken.has(def.name)
      ? Promise.reject(new Error(`код ${def.name} не загрузился`))
      : screen(def);
  return { codes, broken };
};

/** Код экранов, загрузка которого ждёт `release()`: все экраны разом. */
const holdable = () => {
  const codes = exampleCodes({}, ExamplePagesUiAppDef);
  const screen = codes.screen.bind(codes);
  const gate = Promise.withResolvers<void>();
  codes.screen = async (def) => {
    await gate.promise;
    return screen(def);
  };
  return { codes, release: () => gate.resolve() };
};

/**
 * Конец, оборванный раньше подписки: опоздавший `onBreak` зовётся сразу,
 * как у конца сокета.
 */
class BrokenEnd extends StubEnd {
  constructor() {
    super();
    this.drop();
  }

  override onBreak(handler: (error: Error) => void): void {
    handler(new Error('BrokenEnd: связь оборвалась'));
  }
}

/** Сообщение сервера `signal` по подписке `watch` с событием `eventId`. */
const signalOf = (watch: string, eventId: string): ServerMsg => ({
  kind: 'signal',
  watch,
  signal: {
    event: TaskEvents.created.name,
    eventId,
    trace: { cause: { kind: 'event', eventId }, correlationId: eventId },
  },
});

const noteOf = (
  notification: string,
  title: string,
  eventId: string,
): ServerMsg => ({
  kind: 'notification',
  notification,
  data: { title },
  links: [ASSIGNED],
  eventId,
});

/** Журнал состояний области: подписка сразу отдаёт текущее, затем каждое новое. */
const journal = (client: PageClient, region: PageRegionName) => {
  const log: PageViewState[] = [];
  client.source(region).subscribe((state) => {
    log.push(state);
  });
  return log;
};

const statuses = (log: readonly PageViewState[]) =>
  log.map((state) => state.status);

/** Сколько раз в журнале включался признак перечитывания. */
const refreshPeriods = (log: readonly PageViewState[]) =>
  log.filter(
    (state, index) =>
      state.refreshing && !(log[index - 1]?.refreshing ?? false),
  ).length;

/** Id подписки, отправленной на экран `screen`. */
const watchOf = (end: StubEnd, screen: string): string => {
  for (const message of end.sent) {
    if (message.kind === 'watch' && message.address.screen === screen) {
      return message.watch;
    }
  }
  throw new Error(`нет подписки на ${screen}`);
};

const ASSIGNED_NOTE = 'exampleUi/todo/taskAssigned';
const COMPLETED_NOTE = 'exampleUi/todo/taskCompleted';

/** Новый конец после переподключения: ответы списка и назначенных. */
const nextEnd = (context = CONTEXT) =>
  new StubEnd(context)
    .answer('listTasks', ok(TASKS))
    .answer('listAssignedTasks', ok([]));

/** Исход промиса к концу `flush()`: не разрешённый к этому моменту — «ждёт». */
const soon = (promise: Promise<unknown>, end: StubEnd) =>
  Promise.race([
    promise.then(
      () => 'разрешён',
      () => 'отклонён',
    ),
    end.flush().then(() => 'ждёт'),
  ]);

describe('PageClient.route', () => {
  test('вход маршрута открывается в main: подписка раньше вызова, вызов — простая команда с requestId', async () => {
    const { client, end } = tab();

    await client.route('/');

    expect(end.sent).toStrictEqual([
      { kind: 'watch', watch: expect.any(String), address: LIST },
      {
        kind: 'call',
        id: expect.any(String),
        call: { module: 'todo', uc: 'listTasks', input: {}, requestId: 'r-1' },
      },
    ]);
    expect(client.region('main').view?.screen).toBe(LIST_ID);
    expect(client.region('main').view?.revision).toBe(1);
    expect(client.region('side').view).toBeUndefined();
  });

  test('маршрут /assigned — вход assigned', async () => {
    const end = new StubEnd().answer('listAssignedTasks', ok([]));
    const { client, text } = tab(end);

    await client.route('/assigned');

    expect(client.region('main').view?.screen).toBe(ASSIGNED_ID);
    expect(text.page()).toContain('Назначенные мне');
  });

  test('маршрут /menu — вход menu: меню в main без вызовов на сервер, в тексте подпись и три действия', async () => {
    const { client, end, text } = tab(new StubEnd());

    await client.route('/menu');

    expect(client.region('main').view?.screen).toBe(MENU_ID);
    expect(end.calls()).toEqual([]);
    expect(
      client.region('main').view?.actions.map((action) => action.name),
    ).toEqual(['tasks', 'assigned', 'close']);
    expect(text.page()).toContain('Начать работу');
    expect(text.page()).toContain('Мои задачи');
    expect(text.page()).toContain('Назначенные мне');
  });

  test('неразборчивый URL — вход start с заметкой: подписка на список и его чтение', async () => {
    const { client, end } = tab();

    await client.route('/нет');

    expect(client.region('main')).toMatchObject({
      status: 'ready',
      address: LIST,
      note: PAGE_NOTES.notFound,
    });
    expect(client.region('main').view?.screen).toBe(LIST_ID);
    expect(end.sent.map((message) => message.kind)).toEqual(['watch', 'call']);
    expect(watchOf(end, LIST_ID)).toEqual(expect.any(String));
    expect(end.names()).toEqual(['listTasks']);
  });

  test('строка запроса — параметры адреса: /?page=1 — список, страница 1, без заметки', async () => {
    const { client } = tab();

    await client.route('/?page=1');

    expect(client.region('main').view?.address).toEqual({
      screen: LIST_ID,
      params: { page: 1 },
    });
    expect(client.region('main').note).toBeUndefined();
  });

  test('общий путь экрана — карточка задачи в main', async () => {
    const { client, end } = tab();

    await client.route(`/todo/taskCard?taskId=${TASK_A}`);

    expect(client.region('main')).toMatchObject({
      status: 'ready',
      address: { screen: CARD_ID, params: { taskId: TASK_A } },
    });
    expect(client.region('main').note).toBeUndefined();
    expect(end.names()).toEqual(['listTasks']);
  });

  test('кривое значение параметра — вход start с заметкой, промис разрешён, броска нет', async () => {
    const { client } = tab();

    await expect(client.route('/?page=x')).resolves.toBeUndefined();

    expect(client.region('main')).toMatchObject({
      status: 'ready',
      address: LIST,
      note: PAGE_NOTES.notFound,
    });
  });

  test('page() — текст страницы: заголовок экрана и задачи', async () => {
    const { text } = await listed();

    expect(text.page()).toContain('Мои задачи');
    expect(text.page()).toContain('Хлеб');
  });

  test('контекст hello — в виде: только чтение видно в шапке страницы', async () => {
    const end = new StubEnd({ ...CONTEXT, readOnly: true }).answer(
      'listTasks',
      ok(TASKS),
    );
    const { client, text } = await listed(end);

    expect(client.region('main').view?.context).toMatchObject({
      readOnly: true,
    });
    expect(text.page()).toContain('только чтение');
  });

  test('наблюдатель исполнителя получает записи клиента', async () => {
    const { observer } = await listed();

    expect(observer.kinds()).toContain('opened');
  });
});

describe('PageClient — moved', () => {
  test('moved на тот же Def — на месте в main, прежний экземпляр закрыт', async () => {
    const { client, end, text } = await listed();
    const [first = ''] = end.watches();

    const outcome = await client.submit('main', 'next', {});

    expect(outcome).toMatchObject({ kind: 'moved' });
    expect(client.region('main').view?.address).toEqual({
      screen: LIST_ID,
      params: { page: 1 },
    });
    expect(client.region('side').view).toBeUndefined();
    expect(end.unwatches()).toEqual([first]);
    expect(text.page()).toContain('Сыр');
  });

  test('moved на другой Def — в side; main остаётся списком: два экрана открыты вместе', async () => {
    const { client, end } = await listed();

    await client.submit('main', 'open', { taskId: 'Молоко' });

    expect(client.region('side').view?.screen).toBe(CARD_ID);
    expect(client.region('side').view?.data).toMatchObject({
      uuid: TASK_B,
      title: 'Молоко',
    });
    expect(client.region('main').view?.address).toEqual(LIST);
    expect(end.unwatches()).toEqual([]);
  });

  test('второй moved в side — прежний экземпляр side закрыт', async () => {
    const { client, end } = await listed();
    await client.submit('main', 'open', { taskId: 'Молоко' });
    const [, card = ''] = end.watches();

    await client.submit('main', 'open', { taskId: 'Хлеб' });

    expect(client.region('side').view?.data).toMatchObject({ title: 'Хлеб' });
    expect(end.unwatches()).toEqual([card]);
  });

  test('moved из side на другой Def — в main, прежний список закрыт, side остаётся', async () => {
    const { client, end } = await listed();
    await client.submit('main', 'open', { taskId: 'Молоко' });
    const [list = ''] = end.watches();

    await client.submit('side', 'back', {});

    expect(client.region('main').view?.screen).toBe(LIST_ID);
    expect(client.region('side').view?.screen).toBe(CARD_ID);
    expect(end.unwatches()).toEqual([list]);
  });
});

describe('PageClient — исходы действий', () => {
  test('exited в main — текст выхода из Def и вход start заново; requestId — на каждый сигнал', async () => {
    const end = new StubEnd()
      .answer('listTasks', ok(TASKS))
      .answer('createTask', ok({ taskId: TASK_A }));
    const { client } = await listed(end);
    const [first = ''] = end.watches();

    const outcome = await client.submit('main', 'create', { title: 'Хлеб' });

    expect(outcome).toMatchObject({ kind: 'exited', exit: 'created' });
    expect(client.region('main').note).toBe('Задача создана');
    expect(client.region('main').view?.address).toEqual(LIST);
    expect(end.calls()).toStrictEqual([
      { module: 'todo', uc: 'listTasks', input: {}, requestId: 'r-1' },
      {
        module: 'todo',
        uc: 'createTask',
        input: { title: 'Хлеб' },
        requestId: 'r-2',
      },
      { module: 'todo', uc: 'listTasks', input: {}, requestId: 'r-3' },
    ]);
    expect(end.unwatches()).toEqual([first]);
  });

  test('confirm — ожидающее подтверждение области; confirm(region) — тот же вход с подтверждением', async () => {
    const end = new StubEnd()
      .answer('listTasks', ok(TASKS))
      .answer('completeTasks', ok({}));
    const { client } = await listed(end);
    await client.local('main', 'toggle', { taskId: 'Хлеб' });

    const asked = await client.submit('main', 'completeSelected', {});

    expect(asked).toMatchObject({ kind: 'confirm' });
    expect(end.names()).not.toContain('completeTasks');
    expect(client.region('main').confirm).toEqual({
      action: 'completeSelected',
      label: 'Выполнить выбранные задачи?',
      description: 'Выполненную задачу нельзя вернуть в работу.',
    });

    const done = await client.confirm('main');

    expect(done).toMatchObject({ kind: 'stayed' });
    expect(end.calls().filter((c) => c.uc === 'completeTasks')).toEqual([
      {
        module: 'todo',
        uc: 'completeTasks',
        input: { taskIds: [TASK_A] },
        requestId: expect.any(String),
      },
    ]);
    expect(client.region('main').confirm).toBeUndefined();
  });

  test('значение поля с вариантами — подпись варианта; поле без вариантов — как есть', async () => {
    const end = new StubEnd()
      .answer('listTasks', ok(TASKS))
      .answer('assignTask', ok({}));
    const { client } = await listed(end);
    await client.submit('main', 'open', { taskId: 'Молоко' });

    await client.submit('side', 'assign', { assigneeId: testUuid(2) });

    expect(end.calls().find((c) => c.uc === 'assignTask')).toMatchObject({
      input: { taskId: TASK_B, assigneeId: testUuid(2) },
    });
  });

  test('refused действия — текст отказа заметкой области, вид прежний', async () => {
    const end = new StubEnd()
      .answer('listTasks', ok(TASKS))
      .answer('completeTasks', err(ErrorDef.serialize(denied)));
    const { client } = await listed(end);
    await client.local('main', 'toggle', { taskId: 'Хлеб' });
    await client.submit('main', 'completeSelected', {});

    const outcome = await client.confirm('main');

    expect(outcome).toMatchObject({ kind: 'refused' });
    expect(client.region('main').note).toBe(ErrorText.of(denied).summary);
    expect(client.region('main').view?.status).toBe('ready');
  });

  test('refused загрузки — текст отказа и «Повторить»; retry открывает тот же адрес заново', async () => {
    const end = new StubEnd().answer(
      'listTasks',
      err(ErrorDef.serialize(denied)),
    );
    const { client, text } = tab(end);

    await client.route('/');

    expect(client.region('main').view?.status).toBe('refused');
    expect(text.region('main')).toContain(ErrorText.of(denied).summary);
    expect(text.region('main')).toContain('[Повторить]');

    end.answer('listTasks', ok(TASKS));
    await client.retry('main');

    expect(client.region('main').view?.status).toBe('ready');
    expect(client.region('main').view?.address).toEqual(LIST);
    expect(end.names()).toEqual(['listTasks', 'listTasks']);
  });

  test('unavailable — заметка в области, вызова нет', async () => {
    const { client, end } = await listed();

    const outcome = await client.submit('main', 'completeSelected', {});

    expect(outcome).toMatchObject({ kind: 'unavailable', reason: 'disabled' });
    expect(client.region('main').note).toBe('Действие недоступно');
    expect(end.names()).toEqual(['listTasks']);
  });

  test('локальное действие — состояние в виде без вызова на сервер', async () => {
    const { client, end } = await listed();

    const outcome = await client.local('main', 'toggle', { taskId: 'Молоко' });

    expect(outcome).toMatchObject({ kind: 'changed' });
    expect(client.region('main').view?.state).toEqual({ selected: [TASK_B] });
    expect(end.names()).toEqual(['listTasks']);
  });
});

describe('PageClient — сигналы и ревизия', () => {
  test('сигнал по подписке — перечитывание командой с eventId; ревизия растёт', async () => {
    const { client, end } = await listed();
    const [watch = ''] = end.watches();

    end.emit(signalOf(watch, 'e-1'));
    await end.flush();

    expect(end.calls().at(-1)).toStrictEqual({
      module: 'todo',
      uc: 'listTasks',
      input: {},
      eventId: 'e-1',
    });
    expect(client.region('main').view?.revision).toBe(2);
  });

  test('промис обработчика сигнала — после перечитывания: область ready, ревизия 2, refreshing снят', async () => {
    const { client, end } = await listed();
    const [watch = ''] = end.watches();

    await end.deliver(signalOf(watch, 'e-1'));

    expect(client.region('main')).toMatchObject({
      status: 'ready',
      refreshing: false,
      view: { revision: 2 },
    });
  });

  test('stale — «Данные обновились», вид заново на новых данных; действие не исполнено', async () => {
    const end = new StubEnd()
      .answer('listTasks', ok(TASKS))
      .answer('createTask', ok({ taskId: TASK_A }));
    const { client } = await listed(end);
    const [watch = ''] = end.watches();
    end.emit(signalOf(watch, 'e-1'));
    await end.flush();

    const outcome = await client.submit('main', 'create', { title: 'Яйца' }, 1);

    expect(outcome).toMatchObject({ kind: 'stale' });
    expect(client.region('main').note).toBe('Данные обновились');
    expect(client.region('main').view?.revision).toBe(2);
    expect(end.names()).not.toContain('createTask');
  });
});

describe('PageClient.inbox', () => {
  test('уведомление — во входящие: запись { notification, data, links }, текст — на странице; области не тронуты', async () => {
    const { client, end, text } = await listed();
    const revision = client.region('main').view?.revision;

    end.emit(noteOf(ASSIGNED_NOTE, 'Сыр', 'e-1'));
    await end.flush();

    expect(client.inbox().get()).toStrictEqual([
      {
        notification: ASSIGNED_NOTE,
        data: { title: 'Сыр' },
        links: [ASSIGNED],
      },
    ]);
    expect(text.page()).toContain('Входящие\n- Вам назначена задача: Сыр');
    expect(client.region('main').view?.revision).toBe(revision);
    expect(client.region('side').view).toBeUndefined();
  });

  test('inbox() — один источник; subscribe зовёт сразу текущим, новое уведомление — новый массив', async () => {
    const { client, end } = tab();
    const log: (readonly PageInboxEntry[])[] = [];

    client.inbox().subscribe((entries) => {
      log.push(entries);
    });
    end.emit(noteOf(ASSIGNED_NOTE, 'Сыр', 'e-1'));
    await end.flush();

    expect(client.inbox()).toBe(client.inbox());
    expect(log).toHaveLength(2);
    expect(log[0]).toEqual([]);
    expect(log[1]).toHaveLength(1);
    expect(log[1]).not.toBe(log[0]);
    expect(client.inbox().get()).toBe(log[1] ?? []);
  });

  test('повтор уведомления с тем же eventId отсеян', async () => {
    const { client, end } = tab();

    end.emit(noteOf(ASSIGNED_NOTE, 'Сыр', 'e-1'));
    end.emit(noteOf(ASSIGNED_NOTE, 'Сыр', 'e-1'));
    await end.flush();

    expect(client.inbox().get()).toHaveLength(1);
  });

  test('тот же eventId у другого уведомления и другой eventId у того же — не повторы', async () => {
    const { client, end, text } = tab();

    end.emit(noteOf(ASSIGNED_NOTE, 'Сыр', 'e-1'));
    end.emit(noteOf(COMPLETED_NOTE, 'Сыр', 'e-1'));
    end.emit(noteOf(ASSIGNED_NOTE, 'Сыр', 'e-2'));
    await end.flush();

    expect(
      client
        .inbox()
        .get()
        .map((n) => n.notification),
    ).toEqual([ASSIGNED_NOTE, COMPLETED_NOTE, ASSIGNED_NOTE]);
    expect(text.page()).toBe(
      [
        'Входящие',
        '- Вам назначена задача: Сыр',
        '- Поручение выполнено: Сыр',
        '- Вам назначена задача: Сыр',
      ].join('\n'),
    );
  });

  test('повтор через SEEN_TTL_MS показан снова, на миллисекунду раньше — отсеян', async () => {
    const { client, end, clock } = tab();
    end.emit(noteOf(ASSIGNED_NOTE, 'Сыр', 'e-1'));
    await end.flush();

    clock.advance(SEEN_TTL_MS - 1);
    end.emit(noteOf(ASSIGNED_NOTE, 'Сыр', 'e-1'));
    await end.flush();
    expect(client.inbox().get()).toHaveLength(1);
    clock.advance(1);
    end.emit(noteOf(ASSIGNED_NOTE, 'Сыр', 'e-1'));
    await end.flush();

    expect(client.inbox().get()).toHaveLength(2);
  });

  test('во входящих — 50 записей: 51-е уведомление вытесняет первое', async () => {
    const { client, end } = tab();

    for (let n = 1; n <= INBOX_LIMIT + 1; n += 1) {
      end.emit(noteOf(ASSIGNED_NOTE, `Задача ${n}`, `e-${n}`));
    }
    await end.flush();

    const entries = client.inbox().get();
    expect(INBOX_LIMIT).toBe(50);
    expect(entries).toHaveLength(INBOX_LIMIT);
    expect(entries[0]?.data).toEqual({ title: 'Задача 2' });
    expect(entries.at(-1)?.data).toEqual({
      title: `Задача ${INBOX_LIMIT + 1}`,
    });
  });

  test('данные во входящих — как пришли: поле вне схемы Def не срезано', async () => {
    const { client, end } = tab();
    const data = { title: 'Сыр', extra: 1 };

    end.emit({
      kind: 'notification',
      notification: ASSIGNED_NOTE,
      data,
      links: [],
      eventId: 'e-1',
    });
    await end.flush();

    expect(client.inbox().get()).toStrictEqual([
      {
        notification: ASSIGNED_NOTE,
        data: { title: 'Сыр', extra: 1 },
        links: [],
      },
    ]);
  });

  test('уведомление с неизвестным id — не показано, без броска; запись defect без данных', async () => {
    const { client, end, observer } = tab();

    end.emit(noteOf('exampleUi/todo/нетТакого', 'Секрет', 'e-1'));
    await end.flush();

    expect(client.inbox().get()).toEqual([]);
    const defects = observer.records.filter((r) => r.kind === 'defect');
    expect(defects).toMatchObject([
      { node: 'exampleUi/todo/нетТакого', text: PAGE_DEFECTS.unknown },
    ]);
    expect(JSON.stringify(defects)).not.toContain('Секрет');
  });

  test('данные уведомления не по схеме Def — не показаны, defect; верное с тем же ключом позже показано', async () => {
    const { client, end, observer, text } = tab();

    end.emit({
      kind: 'notification',
      notification: ASSIGNED_NOTE,
      data: { title: 42 },
      links: [],
      eventId: 'e-1',
    });
    end.emit(noteOf(ASSIGNED_NOTE, 'Сыр', 'e-1'));
    await end.flush();

    expect(observer.records.filter((r) => r.kind === 'defect')).toMatchObject([
      { node: ASSIGNED_NOTE, text: PAGE_DEFECTS.badData },
    ]);
    expect(client.inbox().get()).toStrictEqual([
      {
        notification: ASSIGNED_NOTE,
        data: { title: 'Сыр' },
        links: [ASSIGNED],
      },
    ]);
    expect(text.page()).toBe('Входящие\n- Вам назначена задача: Сыр');
  });

  test('бросок подписчика входящих — в faults с узлом канала; уведомление во входящих', async () => {
    const { client, end, faults } = tab();
    const boom = new Error('подписчик упал');
    let armed = false;
    client.inbox().subscribe(() => {
      if (armed) throw boom;
    });
    armed = true;

    end.emit(noteOf(ASSIGNED_NOTE, 'Сыр', 'e-1'));
    await end.flush();

    expect(client.inbox().get()).toHaveLength(1);
    expect(faults.find((f) => f.error === boom)?.node).toBe(PAGE_CHANNEL);
  });

  test('ссылка с недекодируемым адресом — заметка в side, вызова нет, main не тронут', async () => {
    const { client, end } = await listed();
    const sent = end.sent.length;

    await client.openLink({ screen: 'нет/такого/экрана', params: {} });

    expect(client.region('side').note).toBe(PAGE_NOTES.notFound);
    expect(client.region('side').view).toBeUndefined();
    expect(client.region('main').view?.screen).toBe(LIST_ID);
    expect(end.sent.length).toBe(sent);
  });

  test('ссылка уведомления открывается в side; main остаётся', async () => {
    const end = new StubEnd()
      .answer('listTasks', ok(TASKS))
      .answer('listAssignedTasks', ok([]));
    const { client } = await listed(end);
    end.emit(noteOf(ASSIGNED_NOTE, 'Сыр', 'e-1'));
    await end.flush();
    const link = client.inbox().get()[0]?.links[0];
    if (link === undefined) throw new Error('в уведомлении нет ссылки');

    await client.openLink(link);

    expect(client.region('side').view?.screen).toBe(ASSIGNED_ID);
    expect(client.region('main').view?.screen).toBe(LIST_ID);
    expect(end.calls().at(-1)).toStrictEqual({
      module: 'todo',
      uc: 'listAssignedTasks',
      input: {},
      requestId: expect.any(String),
    });
  });
});

describe('PageClient — снимок вкладки', () => {
  test('snapshot — JSON без потерь; resume на новой вкладке возвращает обе области и состояние', async () => {
    const first = await listed();
    await first.client.local('main', 'toggle', { taskId: 'Хлеб' });
    await first.client.submit('main', 'open', { taskId: 'Молоко' });
    const snapshot = first.client.snapshot();

    expect(JSON.parse(JSON.stringify(snapshot))).toStrictEqual(snapshot);

    const second = tab();
    await second.client.resume(snapshot);

    expect(second.client.region('main').view?.address).toEqual(LIST);
    expect(second.client.region('main').view?.state).toEqual({
      selected: [TASK_A],
    });
    expect(second.client.region('side').view?.screen).toBe(CARD_ID);
    expect(second.client.region('side').view?.data).toMatchObject({
      title: 'Молоко',
    });
  });

  test.each([
    ['undefined', undefined],
    ['null', null],
    ['строка', 'мусор'],
    ['число', 42],
    ['массив', []],
  ])(
    'resume(%s) — вход start в main, side пуста, без броска',
    async (_name, json) => {
      const { client } = tab();

      await client.resume(json);

      expect(client.region('main').view?.address).toEqual(LIST);
      expect(client.region('side').view).toBeUndefined();
    },
  );

  test.each([
    { name: 'число', side: 42 },
    { name: 'адрес-строка', side: { address: 'мусор', revision: 1 } },
    {
      name: 'чужой экран',
      side: { address: { screen: 'нет/такого', params: {} }, revision: 1 },
    },
  ])(
    'side снимка — $name: main восстановлен, side пуста, без броска',
    async ({ side }) => {
      const first = await listed();
      const second = tab();

      await second.client.resume({ ...first.client.snapshot(), side });

      expect(second.client.region('main').view?.address).toEqual(LIST);
      expect(second.client.region('side').view).toBeUndefined();
    },
  );

  test('main с невосстановленным адресом в снимке — вход start', async () => {
    const first = await listed();
    const broken = JSON.parse(
      JSON.stringify(first.client.snapshot()).replace(LIST_ID, 'нет/такого'),
    );
    const second = tab();

    await second.client.resume(broken);

    expect(second.client.region('main').view?.address).toEqual(LIST);
  });
});

describe('PageClient — состояния области: открытие', () => {
  test('первое открытие: route синхронно ставит loading с адресом, затем ready; журнал empty → loading → ready', async () => {
    const { client } = tab();
    const log = journal(client, 'main');

    const routing = client.route('/');

    expect(client.region('main')).toMatchObject({
      status: 'loading',
      address: LIST,
      refreshing: false,
    });
    expect(client.region('main').view).toBeUndefined();
    await routing;
    expect(statuses(log)).toEqual(['empty', 'loading', 'ready']);
    expect(log[0]).toEqual({ status: 'empty', refreshing: false, issues: [] });
    const ready = client.region('main');
    expect(ready.view?.screen).toBe(LIST_ID);
    expect(ready.address).toEqual(LIST);
    expect(ready.refreshing).toBe(false);
    expect(ready.stale).toBeUndefined();
  });

  test('загрузка в отказ: журнал loading → refused, вид отказа', async () => {
    const end = new StubEnd().answer(
      'listTasks',
      err(ErrorDef.serialize(denied)),
    );
    const { client } = tab(end);
    const log = journal(client, 'main');

    await client.route('/');

    expect(statuses(log)).toEqual(['empty', 'loading', 'refused']);
    expect(client.region('main').view?.status).toBe('refused');
    expect(client.region('main').refreshing).toBe(false);
  });

  test('«Повторить»: снова loading с тем же адресом, затем ready', async () => {
    const end = new StubEnd().answer(
      'listTasks',
      err(ErrorDef.serialize(denied)),
    );
    const { client } = tab(end);
    await client.route('/');
    end.answer('listTasks', ok(TASKS));
    const log = journal(client, 'main');

    const retrying = client.retry('main');

    expect(client.region('main')).toMatchObject({
      status: 'loading',
      address: LIST,
    });
    await retrying;
    expect(statuses(log)).toEqual(['refused', 'loading', 'ready']);
  });

  test('выход в main: в loading входа start уже видна заметка выхода', async () => {
    const end = new StubEnd()
      .answer('listTasks', ok(TASKS))
      .answer('createTask', ok({ taskId: TASK_A }));
    const { client } = await listed(end);
    const log = journal(client, 'main');

    await client.submit('main', 'create', { title: 'Хлеб' });

    expect(statuses(log)).toEqual(['ready', 'loading', 'ready']);
    expect(log[1]).toMatchObject({ address: LIST, note: 'Задача создана' });
  });

  test('пока грузится новый экран, прежнего экземпляра в области нет: подписка снята, действие — unavailable/closed', async () => {
    const end = new StubEnd()
      .answer('listTasks', ok(TASKS))
      .answer('listAssignedTasks', ok([]))
      .hold('listAssignedTasks');
    const { client } = await listed(end);
    const [list = ''] = end.watches();

    const routing = client.route('/assigned');

    expect(end.unwatches()).toEqual([list]);
    expect(client.region('main')).toMatchObject({
      status: 'loading',
      address: ASSIGNED,
    });
    expect(await client.submit('main', 'next', {})).toEqual({
      kind: 'unavailable',
      reason: 'closed',
    });
    expect(client.region('main').note).toBeUndefined();
    end.release('listAssignedTasks');
    await routing;
    expect(client.region('main').view?.screen).toBe(ASSIGNED_ID);
    expect(client.region('main').note).toBeUndefined();
  });

  test('действие по области в loading заметку открытия не трогает: заметка выхода остаётся и на новом экране', async () => {
    const end = new StubEnd()
      .answer('listTasks', ok(TASKS))
      .answer('createTask', ok({ taskId: TASK_A }));
    const { client } = await listed(end);
    end.hold('listTasks');

    const creating = client.submit('main', 'create', { title: 'Хлеб' });
    await end.flush();
    expect(client.region('main')).toMatchObject({
      status: 'loading',
      note: 'Задача создана',
    });
    const outcome = await client.submit('main', 'next', {});

    expect(outcome).toEqual({ kind: 'unavailable', reason: 'closed' });
    expect(client.region('main').note).toBe('Задача создана');
    end.release('listTasks');
    await creating;
    expect(client.region('main')).toMatchObject({
      status: 'ready',
      note: 'Задача создана',
    });
  });

  test('исход действия ушедшего экземпляра область не трогает: выход после перехода не открывает вход start', async () => {
    const end = new StubEnd()
      .answer('listTasks', ok(TASKS))
      .answer('listAssignedTasks', ok([]))
      .answer('createTask', ok({ taskId: TASK_A }))
      .hold('createTask');
    const { client } = await listed(end);

    const creating = client.submit('main', 'create', { title: 'Хлеб' });
    await end.flush();
    await client.route('/assigned');
    const log = journal(client, 'main');
    end.release('createTask');
    const outcome = await creating;
    await end.flush();

    expect(outcome).toMatchObject({ kind: 'exited' });
    expect(client.region('main').view?.screen).toBe(ASSIGNED_ID);
    expect(client.region('main').note).toBeUndefined();
    expect(statuses(log)).toEqual(['ready']);
  });

  test('неразборчивый URL во время загрузки — побеждает вход start с заметкой, опоздавший экземпляр закрыт', async () => {
    const end = new StubEnd()
      .answer('listTasks', ok(TASKS))
      .answer('listAssignedTasks', ok([]))
      .hold('listAssignedTasks');
    const { client } = tab(end);

    const routing = client.route('/assigned');
    await client.route('/нет');
    end.release('listAssignedTasks');
    await routing;
    await end.flush();

    expect(client.region('main')).toMatchObject({
      status: 'ready',
      address: LIST,
      note: PAGE_NOTES.notFound,
    });
    expect(client.region('main').view?.screen).toBe(LIST_ID);
    expect(end.unwatches()).toEqual([watchOf(end, ASSIGNED_ID)]);
  });

  test('недекодируемая ссылка во время загрузки side: side пуста с заметкой, опоздавший экземпляр закрыт', async () => {
    const end = new StubEnd()
      .answer('listTasks', ok(TASKS))
      .answer('listAssignedTasks', ok([]))
      .hold('listAssignedTasks');
    const { client } = await listed(end);

    const opening = client.openLink(ASSIGNED);
    expect(client.region('side').status).toBe('loading');
    await client.openLink({ screen: 'нет/такого', params: {} });
    end.release('listAssignedTasks');
    await opening;
    await end.flush();

    expect(client.region('side')).toMatchObject({
      status: 'empty',
      note: PAGE_NOTES.notFound,
    });
    expect(end.unwatches()).toEqual([watchOf(end, ASSIGNED_ID)]);
  });

  test('два открытия в одну область без ожидания: в области последнее начатое; экземпляр первого закрыт и в область не встал', async () => {
    const end = new StubEnd()
      .answer('listTasks', ok(TASKS))
      .answer('listAssignedTasks', ok([]))
      .hold('listTasks');
    const { client } = tab(end);
    const log = journal(client, 'main');

    const first = client.route('/');
    const second = client.route('/assigned');
    await second;
    end.release('listTasks');
    await first;
    await end.flush();

    expect(client.region('main').view?.address).toEqual(ASSIGNED);
    expect(end.unwatches()).toEqual([watchOf(end, LIST_ID)]);
    expect(log.some((state) => state.view?.screen === LIST_ID)).toBe(false);
  });

  test('resume: области снимка проходят loading со своим адресом, затем ready', async () => {
    const first = await listed();
    await first.client.submit('main', 'open', { taskId: 'Молоко' });
    const snapshot = first.client.snapshot();
    const second = tab();
    const main = journal(second.client, 'main');
    const side = journal(second.client, 'side');

    await second.client.resume(snapshot);

    expect(statuses(main).slice(-2)).toEqual(['loading', 'ready']);
    expect(main.at(-2)?.address).toEqual(LIST);
    expect(statuses(side).slice(-2)).toEqual(['loading', 'ready']);
    expect(side.at(-2)?.address).toEqual(snapshot.side?.address);
  });
});

describe('PageClient — состояния области: отказ открытия', () => {
  const failed: PageViewState = {
    status: 'empty',
    refreshing: false,
    note: PAGE_NOTES.failed,
    issues: [],
  };

  test('код экрана не загрузился: loading → empty с заметкой, route отказал; следующий route открывает экран', async () => {
    const { codes, broken } = breakable();
    broken.add(TaskListScreenDef.name);
    const { client } = tab(undefined, codes);
    const log = journal(client, 'main');

    await expect(client.route('/')).rejects.toThrow('не загрузился');

    expect(statuses(log)).toEqual(['empty', 'loading', 'empty']);
    expect(client.region('main')).toEqual(failed);
    broken.clear();
    await client.route('/');
    expect(client.region('main').view?.screen).toBe(LIST_ID);
  });

  test('отказ открытия поверх готового экрана: прежний снят, область пуста с заметкой; повтор — новым переходом', async () => {
    const end = new StubEnd()
      .answer('listTasks', ok(TASKS))
      .answer('listAssignedTasks', ok([]));
    const { codes, broken } = breakable();
    const { client } = tab(end, codes);
    await client.route('/');
    const log = journal(client, 'main');
    broken.add(AssignedTasksScreenDef.name);

    await expect(client.route('/assigned')).rejects.toThrow('не загрузился');

    expect(statuses(log)).toEqual(['ready', 'loading', 'empty']);
    expect(client.region('main')).toEqual(failed);
    expect(end.unwatches()).toEqual([watchOf(end, LIST_ID)]);
    broken.clear();
    await client.route('/assigned');
    expect(client.region('main').view?.screen).toBe(ASSIGNED_ID);
  });

  test('опоздавший отказ открытия область не трогает: в ней последнее начатое', async () => {
    const end = new StubEnd()
      .answer('listTasks', ok(TASKS))
      .answer('listAssignedTasks', ok([]))
      .hold('listAssignedTasks');
    const { codes, broken } = breakable();
    broken.add(TaskListScreenDef.name);
    const { client } = tab(end, codes);

    const first = client.route('/');
    const second = client.route('/assigned');
    await expect(first).rejects.toThrow('не загрузился');
    expect(client.region('main').status).toBe('loading');
    end.release('listAssignedTasks');
    await second;

    expect(client.region('main').view?.screen).toBe(ASSIGNED_ID);
    expect(client.region('main').note).toBeUndefined();
  });

  test('resume: main восстановлен, side бросил — main готова со своим видом, side пуста с заметкой', async () => {
    const first = await listed();
    await first.client.submit('main', 'open', { taskId: 'Молоко' });
    const snapshot = first.client.snapshot();
    const { codes, broken } = breakable();
    broken.add(TaskCardScreenDef.name);
    const second = tab(undefined, codes);

    await expect(second.client.resume(snapshot)).rejects.toThrow(
      'не загрузился',
    );

    expect(second.client.region('main')).toMatchObject({
      status: 'ready',
      address: LIST,
    });
    expect(second.client.region('main').view?.screen).toBe(LIST_ID);
    expect(second.client.region('side')).toEqual(failed);
  });

  test('resume: отказ restore — отказ вызывающему, области снимка не остаются в loading', async () => {
    const first = await listed();
    await first.client.submit('main', 'open', { taskId: 'Молоко' });
    const snapshot = first.client.snapshot();
    const { codes, broken } = breakable();
    broken.add(TaskListScreenDef.name);
    const second = tab(undefined, codes);

    await expect(second.client.resume(snapshot)).rejects.toThrow(
      'не загрузился',
    );

    expect(second.client.region('main')).toEqual(failed);
    expect(second.client.region('side').status).toBe('empty');
  });
});

describe('PageClient — состояния области: перечитывание', () => {
  test('сразу после сигнала — refreshing и прежняя ревизия; после flush — признак снят, ревизия 2', async () => {
    const { client, end } = await listed();
    const log = journal(client, 'main');
    const [watch = ''] = end.watches();

    end.emit(signalOf(watch, 'e-1'));

    expect(client.region('main')).toMatchObject({
      status: 'ready',
      refreshing: true,
    });
    expect(client.region('main').view?.revision).toBe(1);
    await end.flush();
    expect(client.region('main').refreshing).toBe(false);
    expect(client.region('main').view?.revision).toBe(2);
    expect(refreshPeriods(log)).toBe(1);
  });

  test('два сигнала подряд — один период refreshing, итог снят, ревизия выросла', async () => {
    const { client, end } = await listed();
    const log = journal(client, 'main');
    const [watch = ''] = end.watches();

    end.emit(signalOf(watch, 'e-1'));
    end.emit(signalOf(watch, 'e-2'));
    await end.flush();

    expect(refreshPeriods(log)).toBe(1);
    expect(client.region('main').refreshing).toBe(false);
    expect(client.region('main').view?.revision).toBeGreaterThan(1);
  });

  test('перечитывание в отказ — refused, refreshing снят', async () => {
    const { client, end } = await listed();
    const [watch = ''] = end.watches();
    end.answer('listTasks', err(ErrorDef.serialize(denied)));

    end.emit(signalOf(watch, 'e-1'));
    await end.flush();

    expect(client.region('main')).toMatchObject({
      status: 'refused',
      refreshing: false,
    });
    expect(client.region('main').view?.status).toBe('refused');
  });

  test('сигнал по подписке side не трогает refreshing в main', async () => {
    const { client, end } = await listed();
    await client.submit('main', 'open', { taskId: 'Молоко' });

    end.emit(signalOf(watchOf(end, CARD_ID), 'e-1'));

    expect(client.region('side').refreshing).toBe(true);
    expect(client.region('main').refreshing).toBe(false);
    await end.flush();
    expect(client.region('side').refreshing).toBe(false);
  });

  test('сигнал во время загрузки refreshing не ставит: область в loading, после загрузки признак снят', async () => {
    const end = new StubEnd().answer('listTasks', ok(TASKS)).hold('listTasks');
    const { client } = tab(end);
    const log = journal(client, 'main');

    const routing = client.route('/');
    await end.flush();
    end.emit(signalOf(watchOf(end, LIST_ID), 'e-1'));

    expect(client.region('main')).toMatchObject({
      status: 'loading',
      refreshing: false,
    });
    end.release('listTasks');
    await routing;
    await end.flush();
    expect(client.region('main').refreshing).toBe(false);
    expect(refreshPeriods(log)).toBe(0);
  });

  test('сигнал по неизвестной подписке refreshing не ставит', async () => {
    const { client, end } = await listed();

    end.emit(signalOf('w-нет', 'e-1'));

    expect(client.region('main').refreshing).toBe(false);
    expect(client.region('side').refreshing).toBe(false);
  });
});

describe('PageClient — состояния области: устаревшее действие', () => {
  /** Список после перечитывания до ревизии 2 и действие по ревизии 1. */
  const staled = async () => {
    const end = new StubEnd()
      .answer('listTasks', ok(TASKS))
      .answer('createTask', ok({ taskId: TASK_A }));
    const t = await listed(end);
    end.emit(signalOf(watchOf(end, LIST_ID), 'e-1'));
    await end.flush();
    const outcome = await t.client.submit(
      'main',
      'create',
      { title: 'Яйца' },
      1,
    );
    return { ...t, outcome };
  };

  test('исход stale — stale: revision и заметка «Данные обновились»', async () => {
    const { client, outcome } = await staled();

    expect(outcome).toMatchObject({ kind: 'stale' });
    expect(client.region('main')).toMatchObject({
      status: 'ready',
      stale: 'revision',
      note: 'Данные обновились',
    });
  });

  test('перечитывание отметку stale не снимает', async () => {
    const { client, end } = await staled();

    end.emit(signalOf(watchOf(end, LIST_ID), 'e-2'));
    await end.flush();

    expect(client.region('main').view?.revision).toBe(3);
    expect(client.region('main')).toMatchObject({
      stale: 'revision',
      note: 'Данные обновились',
    });
  });

  test.each([
    {
      name: 'rejected',
      next: (client: PageClient) =>
        client.submit('main', 'create', { title: '' }),
    },
    {
      name: 'локальное changed',
      next: (client: PageClient) =>
        client.local('main', 'toggle', { taskId: 'Хлеб' }),
    },
  ])('следующий исход ($name) снимает stale', async ({ next }) => {
    const { client } = await staled();

    await next(client);

    expect(client.region('main').stale).toBeUndefined();
  });
});

describe('PageClient — состояния области: контракт источника', () => {
  test('инварианты на каждом значении журнала: вид ⇔ ready/refused, адрес ⇔ не empty, значения JSON и не меняются после выдачи', async () => {
    const end = new StubEnd()
      .answer('listTasks', ok(TASKS))
      .answer('createTask', ok({ taskId: TASK_A }));
    const { client } = tab(end);
    const seen: { state: PageViewState; json: string }[] = [];
    for (const region of ['main', 'side'] as const) {
      client.source(region).subscribe((state) => {
        seen.push({ state, json: JSON.stringify(state) });
      });
    }
    const main = journal(client, 'main');

    await client.openLink({ screen: 'нет/такого', params: {} });
    await client.route('/');
    await client.local('main', 'toggle', { taskId: 'Хлеб' });
    await client.submit('main', 'open', { taskId: 'Молоко' });
    end.emit(signalOf(watchOf(end, LIST_ID), 'e-1'));
    await end.flush();
    await client.submit('main', 'create', { title: '' });
    await client.submit('main', 'create', { title: 'Яйца' }, 1);
    await client.submit('main', 'create', { title: 'Хлеб' });
    end.answer('listTasks', err(ErrorDef.serialize(denied)));
    await client.retry('main');

    expect(new Set(statuses(main))).toEqual(
      new Set(['empty', 'loading', 'ready', 'refused']),
    );
    for (const [index, { state, json }] of seen.entries()) {
      const viewed = state.status === 'ready' || state.status === 'refused';
      expect(state.view !== undefined).toBe(viewed);
      if (state.view !== undefined) {
        expect(state.status).toBe(state.view.status);
        expect(state.address).toEqual(state.view.address);
      }
      expect(state.address === undefined).toBe(state.status === 'empty');
      expect(typeof state.refreshing).toBe('boolean');
      expect(Array.isArray(state.issues)).toBe(true);
      expect(JSON.parse(json)).toEqual(state);
      expect(state).not.toBe(seen[index - 1]?.state);
    }
  });

  test('бросок подписчика источника не рвёт submit: исход вернулся, faults получил UiFault с ошибкой', async () => {
    const { client, faults } = await listed();
    const boom = new Error('подписчик упал');
    let armed = false;
    client.source('main').subscribe(() => {
      if (armed) throw boom;
    });
    armed = true;

    const outcome = await client.submit('main', 'next', {});

    expect(outcome).toMatchObject({ kind: 'moved' });
    expect(client.region('main').view?.address).toEqual({
      screen: LIST_ID,
      params: { page: 1 },
    });
    const fault = faults.find((f) => f.error === boom);
    expect(fault).toBeDefined();
    expect(fault?.node).toBe(LIST_ID);
    expect(fault?.trace).toBeDefined();
  });

  test('бросок подписчика пустой области — узел UiFault — имя канала', async () => {
    const { client, faults } = tab();
    const boom = new Error('подписчик упал');
    let armed = false;
    client.source('side').subscribe(() => {
      if (armed) throw boom;
    });
    armed = true;

    await client.openLink({ screen: 'нет/такого', params: {} });

    expect(client.region('side').status).toBe('empty');
    expect(faults.find((f) => f.error === boom)?.node).toBe(PAGE_CHANNEL);
  });

  test('source(name) — один объект на всё время жизни вкладки; region(name) — его текущее значение', async () => {
    const { client } = tab();
    const main = client.source('main');

    await client.route('/');
    await client.resume(client.snapshot());

    expect(client.source('main')).toBe(main);
    expect(client.source('side')).not.toBe(main);
    expect(client.region('main')).toBe(main.get());
  });
});

describe('PageClient — обрыв и переподключение', () => {
  const offline = 'offline';
  const failed: PageViewState = {
    status: 'empty',
    refreshing: false,
    note: PAGE_NOTES.failed,
    issues: [],
  };

  test('обрыв: у готовой main — stale offline, вид прежний; у пустой side пометки нет', async () => {
    const { client, end } = await listed();
    const view = client.region('main').view;

    end.drop();
    await end.flush();

    expect(client.region('main')).toMatchObject({
      status: 'ready',
      stale: offline,
      refreshing: false,
    });
    expect(client.region('main').view).toStrictEqual(view);
    expect(client.region('side')).toEqual({
      status: 'empty',
      refreshing: false,
      issues: [],
    });
  });

  test('без связи submit, confirm, local — unavailable disabled: исполнитель не звался, на провод ничего', async () => {
    const { client, end, observer } = await listed();
    await client.local('main', 'toggle', { taskId: 'Хлеб' });
    await client.submit('main', 'completeSelected', {});
    expect(client.region('main').confirm).toBeDefined();
    end.drop();
    const records = observer.records.length;

    const disabled = { kind: 'unavailable', reason: 'disabled' } as const;
    expect(await client.confirm('main')).toEqual(disabled);
    expect(await client.submit('main', 'create', { title: 'Хлеб' })).toEqual(
      disabled,
    );
    expect(await client.local('main', 'toggle', { taskId: 'Молоко' })).toEqual(
      disabled,
    );

    expect(observer.records.slice(records)).toEqual([]);
    expect(end.afterBreak).toEqual([]);
    expect(client.region('main').view?.state).toEqual({ selected: [TASK_A] });
    expect(client.region('main')).toMatchObject({
      note: PAGE_NOTES.unavailable,
      stale: offline,
    });
  });

  test('без связи route — main в loading с пометкой, вызовов нет, промис ждёт; после attach — экран по новому концу, промис разрешён', async () => {
    const { client, end, observer } = await listed();
    end.drop();

    const routing = client.route('/assigned');

    expect(await soon(routing, end)).toBe('ждёт');
    expect(client.region('main')).toMatchObject({
      status: 'loading',
      address: ASSIGNED,
      stale: offline,
    });
    expect(end.afterBreak).toEqual([]);
    expect(observer.kinds()).not.toContain('defect');
    const end2 = nextEnd();
    await client.attach(end2);
    expect(await soon(routing, end2)).toBe('разрешён');
    expect(client.region('main')).toMatchObject({
      status: 'ready',
      address: ASSIGNED,
    });
    expect(client.region('main').stale).toBeUndefined();
    expect(end2.names()).toEqual(['listAssignedTasks']);
  });

  test('без связи неразборчивый URL — вход start в loading с пометкой и заметкой, вызовов нет; после attach — вход start с заметкой', async () => {
    const { client, end } = tab();
    end.drop();

    const routing = client.route('/нет');

    expect(await soon(routing, end)).toBe('ждёт');
    expect(client.region('main')).toMatchObject({
      status: 'loading',
      address: LIST,
      stale: offline,
      note: PAGE_NOTES.notFound,
    });
    expect(end.sent).toEqual([]);
    expect(end.afterBreak).toEqual([]);
    const end2 = nextEnd();
    await client.attach(end2);
    expect(await soon(routing, end2)).toBe('разрешён');
    expect(client.region('main')).toMatchObject({
      status: 'ready',
      address: LIST,
      note: PAGE_NOTES.notFound,
    });
    expect(end2.names()).toEqual(['listTasks']);
  });

  test('два перехода без связи в одну область: первый промис разрешён сразу, после attach открыт последний', async () => {
    const { client, end } = await listed();
    end.drop();

    const first = client.route('/');
    const second = client.route('/assigned');

    expect(await soon(first, end)).toBe('разрешён');
    expect(await soon(second, end)).toBe('ждёт');
    const end2 = nextEnd();
    await client.attach(end2);
    await second;
    expect(client.region('main').view?.screen).toBe(ASSIGNED_ID);
    expect(end2.names()).toEqual(['listAssignedTasks']);
  });

  test('отложенный переход, код экрана которого не загрузился: attach разрешён, промис перехода отклонён, область пуста с заметкой', async () => {
    const { codes, broken } = breakable();
    const { client, end } = tab(undefined, codes);
    end.drop();
    broken.add(AssignedTasksScreenDef.name);

    const routing = client.route('/assigned').then(
      () => 'разрешён',
      (error: Error) => error.message,
    );
    await client.attach(nextEnd());

    expect(await routing).toContain('не загрузился');
    expect(client.region('main')).toEqual(failed);
  });

  test('attach: у области с экземпляром по новому концу сначала watch, затем call загрузки с новым requestId', async () => {
    const { client, end } = await listed();
    end.drop();
    const end2 = nextEnd();

    await client.attach(end2);

    expect(end2.sent).toStrictEqual([
      { kind: 'watch', watch: expect.any(String), address: LIST },
      {
        kind: 'call',
        id: expect.any(String),
        call: {
          module: 'todo',
          uc: 'listTasks',
          input: {},
          requestId: expect.any(String),
        },
      },
    ]);
    const requestIds = (e: StubEnd) =>
      e.calls().map((call) => ('requestId' in call ? call.requestId : ''));
    const [restored = ''] = requestIds(end2);
    expect(requestIds(end)).not.toContain(restored);
  });

  test('attach: подписок по новому концу — по одной на экземпляр области; unwatch прежних нет нигде', async () => {
    const { client, end } = await listed();
    await client.submit('main', 'open', { taskId: 'Молоко' });
    const side = client.region('side').address;
    if (side === undefined) throw new Error('side пуста');
    end.drop();
    const end2 = nextEnd();

    await client.attach(end2);

    const watched = end2.sent.flatMap((m) =>
      m.kind === 'watch' ? [m.address] : [],
    );
    expect(watched).toHaveLength(2);
    expect(watched).toContainEqual(LIST);
    expect(watched).toContainEqual(side);
    expect(end2.unwatches()).toEqual([]);
    expect(end.afterBreak).toEqual([]);
    expect(client.region('side').view?.screen).toBe(CARD_ID);
  });

  test('после attach — ревизия +1, состояние экрана из снимка; stale, refreshing и отметки сняты', async () => {
    const { client, end } = await listed();
    await client.local('main', 'toggle', { taskId: 'Хлеб' });
    await client.submit('main', 'completeSelected', {});
    expect(client.region('main').confirm).toBeDefined();
    end.drop();

    await client.attach(nextEnd());

    const main = client.region('main');
    expect(main).toMatchObject({ status: 'ready', refreshing: false });
    expect(main.view?.revision).toBe(2);
    expect(main.view?.state).toEqual({ selected: [TASK_A] });
    expect(main.stale).toBeUndefined();
    expect(main.note).toBeUndefined();
    expect(main.confirm).toBeUndefined();
  });

  test('пока загрузка восстановления удержана — прежний вид с refreshing и stale offline; затем сняты', async () => {
    const { client, end } = await listed();
    end.drop();
    const end2 = nextEnd().hold('listTasks');

    const attaching = client.attach(end2);
    await end2.flush();

    expect(client.region('main')).toMatchObject({
      status: 'ready',
      refreshing: true,
      stale: offline,
    });
    expect(client.region('main').view?.revision).toBe(1);
    end2.release('listTasks');
    await attaching;
    expect(client.region('main')).toMatchObject({
      status: 'ready',
      refreshing: false,
    });
    expect(client.region('main').stale).toBeUndefined();
    expect(client.region('main').view?.revision).toBe(2);
  });

  test('экземпляр, ушедший в отказ из-за обрыва во время загрузки, после attach — ready', async () => {
    const end = new StubEnd().answer('listTasks', ok(TASKS)).hold('listTasks');
    const { client } = tab(end);
    const routing = client.route('/');
    await end.flush();

    end.drop();
    await routing;
    expect(client.region('main')).toMatchObject({
      status: 'refused',
      stale: offline,
    });
    await client.attach(nextEnd());

    expect(client.region('main')).toMatchObject({
      status: 'ready',
      address: LIST,
      refreshing: false,
    });
    expect(client.region('main').stale).toBeUndefined();
  });

  test('восстановление, код экрана которого не загрузился, — область пуста с заметкой «Экран недоступен»; attach разрешён; в faults — узел канала, текст без данных', async () => {
    const { codes, broken } = breakable();
    const { client, end, faults } = tab(undefined, codes);
    await client.route('/');
    end.drop();
    broken.add(TaskListScreenDef.name);

    await client.attach(nextEnd());

    expect(client.region('main')).toEqual(failed);
    expect(
      faults.map((fault) => [fault.node, (fault.error as Error).message]),
    ).toEqual([[PAGE_CHANNEL, PAGE_FAULTS.resync]]);
  });

  test('форма по ревизии до обрыва после attach — исход stale, команда не ушла', async () => {
    const { client, end } = await listed();
    end.drop();
    const end2 = nextEnd().answer('createTask', ok({ taskId: TASK_A }));
    await client.attach(end2);

    const outcome = await client.submit('main', 'create', { title: 'Яйца' }, 1);

    expect(outcome).toMatchObject({ kind: 'stale' });
    expect(end2.names()).not.toContain('createTask');
  });

  test('переход во время восстановления побеждает: в области экран перехода, восстановленный экземпляр закрыт', async () => {
    const { client, end } = await listed();
    end.drop();
    const end2 = nextEnd().hold('listTasks');
    const attaching = client.attach(end2);
    await end2.flush();

    await client.route('/assigned');
    end2.release('listTasks');
    await attaching;
    await end2.flush();

    expect(client.region('main').view?.screen).toBe(ASSIGNED_ID);
    expect(client.region('main').stale).toBeUndefined();
    expect(end2.unwatches()).toEqual([watchOf(end2, LIST_ID)]);
  });

  test('действие в полёте и обрыв — исход refused, заметка «связь прервалась» вместо текста отказа', async () => {
    const end = new StubEnd()
      .answer('listTasks', ok(TASKS))
      .answer('createTask', ok({ taskId: TASK_A }))
      .hold('createTask');
    const { client } = await listed(end);
    const creating = client.submit('main', 'create', { title: 'Хлеб' });
    await end.flush();

    end.drop();
    const outcome = await creating;

    expect(outcome).toMatchObject({ kind: 'refused' });
    expect(client.region('main')).toMatchObject({
      status: 'ready',
      stale: offline,
      note: PAGE_NOTES.interrupted,
    });
    expect(PAGE_NOTES.interrupted).toBe(
      'Связь прервалась — результат будет виден после переподключения',
    );
  });

  test('attach при живом конце — прежний закрыт, обрыв один раз; экземпляры перечитаны по новому', async () => {
    const { client, end } = await listed();
    const end2 = nextEnd();

    await client.attach(end2);

    expect(end.breaks).toBe(1);
    expect(end.afterBreak).toEqual([]);
    expect(end2.watches()).toHaveLength(1);
    expect(client.region('main').view?.revision).toBe(2);
    expect(client.region('main').stale).toBeUndefined();
  });

  test('контекст нового hello — в виде восстановленных экземпляров', async () => {
    const { client, end } = await listed();
    end.drop();

    await client.attach(nextEnd({ ...CONTEXT, readOnly: true }));

    expect(client.region('main').view?.context).toMatchObject({
      readOnly: true,
    });
  });

  test('сообщения по прежнему концу после attach — без действия: ни сигнала, ни уведомления', async () => {
    const { client, end } = await listed();
    end.drop();
    const end2 = nextEnd();
    await client.attach(end2);
    const calls = end2.calls().length;

    end.emit(signalOf(watchOf(end2, LIST_ID), 'e-1'));
    end.emit(noteOf(ASSIGNED_NOTE, 'Сыр', 'e-1'));
    await end2.flush();

    expect(client.region('main').refreshing).toBe(false);
    expect(client.region('main').view?.revision).toBe(2);
    expect(end2.calls()).toHaveLength(calls);
    expect(client.inbox().get()).toEqual([]);
  });

  test('уведомление с тем же ключом по новому концу — отсеяно: отсев переживает переподключение', async () => {
    const { client, end } = tab();
    end.emit(noteOf(ASSIGNED_NOTE, 'Сыр', 'e-1'));
    await end.flush();
    end.drop();
    const end2 = nextEnd();
    await client.attach(end2);

    end2.emit(noteOf(ASSIGNED_NOTE, 'Сыр', 'e-1'));
    await end2.flush();

    expect(client.inbox().get()).toHaveLength(1);
  });

  test('stale offline — только у непустой области: на каждом значении журнала обеих областей', async () => {
    const { client, end } = await listed();
    await client.submit('main', 'open', { taskId: 'Молоко' });
    const seen: PageViewState[] = [];
    for (const region of ['main', 'side'] as const) {
      client.source(region).subscribe((state) => {
        seen.push(state);
      });
    }

    end.drop();
    await client.openLink({ screen: 'нет/такого', params: {} });
    const routing = client.route('/assigned');
    await end.flush();
    await client.attach(nextEnd());
    await routing;

    expect(seen.some((state) => state.stale === offline)).toBe(true);
    const marked = seen.filter((state) => state.stale === offline);
    expect(marked.map((state) => state.status)).not.toContain('empty');
    expect(client.region('side')).toEqual({
      status: 'empty',
      refreshing: false,
      note: PAGE_NOTES.notFound,
      issues: [],
    });
    expect(client.region('main')).toMatchObject({
      status: 'ready',
      address: ASSIGNED,
      refreshing: false,
    });
    expect(client.region('main').stale).toBeUndefined();
  });

  test('attach при живом конце, пока удержан вызов загрузки: область готова без пометки, по новому концу одно чтение', async () => {
    const { client, end } = await listed();
    end.hold('listTasks');
    const retrying = client.retry('main');
    await end.flush();
    const end2 = nextEnd();

    await client.attach(end2);
    await retrying;

    expect(client.region('main')).toMatchObject({
      status: 'ready',
      address: LIST,
      refreshing: false,
    });
    expect(client.region('main').stale).toBeUndefined();
    expect(end2.names()).toEqual(['listTasks']);
  });

  test('attach, пока грузится код экрана: до конца перечитывания — пометка, действия отключены; после — контекст нового hello', async () => {
    const { codes, release } = holdable();
    const end = new StubEnd().answer('listTasks', ok(TASKS));
    const { client } = tab(end, codes);
    const routing = client.route('/');
    const end2 = nextEnd({ ...CONTEXT, readOnly: true })
      .answer('createTask', ok({ taskId: TASK_A }))
      .hold('listTasks');
    await client.attach(end2);
    release();
    await end2.flush();
    end2.release('listTasks');
    end2.hold('listTasks');
    await end2.flush();

    expect(client.region('main')).toMatchObject({
      status: 'ready',
      stale: offline,
      refreshing: true,
    });
    expect(await client.submit('main', 'create', { title: 'Яйца' })).toEqual({
      kind: 'unavailable',
      reason: 'disabled',
    });
    expect(end2.names()).toEqual(['listTasks', 'listTasks']);
    end2.release('listTasks');
    await routing;

    expect(client.region('main').view?.context).toMatchObject({
      readOnly: true,
    });
    expect(client.region('main').stale).toBeUndefined();
  });

  test('attach к концу, оборванному до подписки: переход ждёт, вызовов и defect нет; следующий attach открывает его', async () => {
    const { client, end, observer } = await listed();
    end.drop();
    const routing = client.route('/assigned');
    const broken = new BrokenEnd();

    await client.attach(broken);

    expect(await soon(routing, broken)).toBe('ждёт');
    expect(client.region('main')).toMatchObject({
      status: 'loading',
      address: ASSIGNED,
      stale: offline,
    });
    expect([...broken.sent, ...broken.afterBreak]).toEqual([]);
    expect(observer.kinds()).not.toContain('defect');
    const end3 = nextEnd();
    await client.attach(end3);
    expect(await soon(routing, end3)).toBe('разрешён');
    expect(client.region('main').view?.screen).toBe(ASSIGNED_ID);
    expect(end3.names()).toEqual(['listAssignedTasks']);
  });

  test('обрыв во время восстановления: пометка остаётся; следующий attach — готово, одно чтение по новому концу', async () => {
    const { client, end } = await listed();
    end.drop();
    const end2 = nextEnd().hold('listTasks');
    const attaching = client.attach(end2);
    await end2.flush();

    end2.drop();
    await attaching;
    expect(client.region('main')).toMatchObject({ stale: offline });
    const end3 = nextEnd();
    await client.attach(end3);

    expect(client.region('main')).toMatchObject({
      status: 'ready',
      address: LIST,
      refreshing: false,
    });
    expect(client.region('main').stale).toBeUndefined();
    expect(end3.names()).toEqual(['listTasks']);
  });

  test('переход во время восстановления со сломанным кодом: сбой восстановления область не очищает — в журнале нет empty', async () => {
    const { codes, broken } = breakable();
    const { client, end } = tab(undefined, codes);
    await client.route('/');
    end.drop();
    broken.add(TaskListScreenDef.name);
    const log = journal(client, 'main');

    const attaching = client.attach(nextEnd());
    const routing = client.route('/assigned');
    await attaching;
    await routing;

    expect(statuses(log)).not.toContain('empty');
    expect(client.region('main')).toMatchObject({
      status: 'ready',
      address: ASSIGNED,
    });
  });
});

// Три области: основная, боковая и модальная. Куда открыть переход, решает
// приложение страниц (`placements`) и умолчание по положению; закрывает область
// человек (`close`), выход из экрана области и уход из временной области
// переходом. Состав областей — в ссылке (`url()`, `route`).

const CARD_IN_MODAL: readonly PagePlacement[] = [
  { screen: TaskCardScreenDef, region: 'modal' },
];
const CARD_LINK = { screen: CARD_ID, params: { taskId: TASK_A } };
const EMPTY_REGION: PageViewState = {
  status: 'empty',
  refreshing: false,
  issues: [],
};

/** Конец со всеми ответами, которые нужны сценариям трёх областей. */
const answered = () =>
  new StubEnd()
    .answer('listTasks', ok(TASKS))
    .answer('listAssignedTasks', ok([]))
    .answer('assignTask', ok({}))
    .answer('createTask', ok({ taskId: TASK_A }))
    .answer('completeTasks', ok({}));

/**
 * Список в `main`, карточка Молока в `modal` (по объявлению), поручения в
 * `side` (по умолчанию для ссылки).
 */
const layered = async (end = answered(), placements = CARD_IN_MODAL) => {
  const t = tab(end, undefined, placements);
  await t.client.route('/');
  await t.client.submit('main', 'open', { taskId: 'Молоко' });
  await t.client.openLink(ASSIGNED);
  return t;
};

/** URL со вложенной карточкой A в боковой области. */
const SIDE_CARD_URL = `/?_side=${encodeURIComponent(`/todo/taskCard?taskId=${TASK_A}`)}`;

describe('PageClient — три области', () => {
  test('три области вместе: независимые источники, три записи снимка, три подписки', async () => {
    const { client, end } = await layered();

    expect(client.region('main').view?.screen).toBe(LIST_ID);
    expect(client.region('side').view?.screen).toBe(ASSIGNED_ID);
    expect(client.region('modal').view?.screen).toBe(CARD_ID);
    expect(Object.keys(client.snapshot()).sort()).toEqual([
      'main',
      'modal',
      'side',
    ]);
    expect(end.watches()).toHaveLength(3);
    const before = {
      side: client.region('side'),
      modal: client.region('modal'),
    };

    await client.local('main', 'toggle', { taskId: 'Хлеб' });

    expect(client.region('main').view?.state).toEqual({ selected: [TASK_A] });
    expect(client.region('side')).toBe(before.side);
    expect(client.region('modal')).toBe(before.modal);
    expect(client.source('modal')).toBe(client.source('modal'));
    expect(client.source('modal')).not.toBe(client.source('side'));
  });

  test('без объявлений открыть — в side, окно не тронуто', async () => {
    const { client } = await listed(answered());

    await client.submit('main', 'open', { taskId: 'Молоко' });

    expect(client.region('side').view?.screen).toBe(CARD_ID);
    expect(client.region('modal')).toEqual(EMPTY_REGION);
  });

  test('с объявлением карточки в окне открыть — в modal, side не тронута', async () => {
    const { client } = tab(answered(), undefined, CARD_IN_MODAL);
    await client.route('/');
    const side = journal(client, 'side');

    await client.submit('main', 'open', { taskId: 'Молоко' });

    expect(client.region('modal').view?.data).toMatchObject({
      uuid: TASK_B,
      title: 'Молоко',
    });
    expect(client.region('main').view?.screen).toBe(LIST_ID);
    expect(client.region('side')).toEqual(EMPTY_REGION);
    expect(side).toHaveLength(1);
  });

  test('второй переход в окно — прежний экземпляр окна закрыт', async () => {
    const { client, end } = tab(answered(), undefined, CARD_IN_MODAL);
    await client.route('/');
    await client.submit('main', 'open', { taskId: 'Молоко' });
    const card = watchOf(end, CARD_ID);

    await client.submit('main', 'open', { taskId: 'Хлеб' });

    expect(client.region('modal').view?.data).toMatchObject({ title: 'Хлеб' });
    expect(end.unwatches()).toEqual([card]);
  });

  test('ссылка уведомления на карточку при card: modal — открывается в окне', async () => {
    const end = answered();
    const { client } = tab(end, undefined, CARD_IN_MODAL);
    await client.route('/');
    end.emit({
      kind: 'notification',
      notification: ASSIGNED_NOTE,
      data: { title: 'Сыр' },
      links: [CARD_LINK],
      eventId: 'e-1',
    });
    await end.flush();
    const link = client.inbox().get()[0]?.links[0];
    if (link === undefined) throw new Error('в уведомлении нет ссылки');

    await client.openLink(link);

    expect(client.region('modal').view?.screen).toBe(CARD_ID);
    expect(client.region('side')).toEqual(EMPTY_REGION);
  });

  test('ссылка на экран без объявления — в side, как раньше', async () => {
    const { client } = tab(answered(), undefined, CARD_IN_MODAL);
    await client.route('/');

    await client.openLink(ASSIGNED);

    expect(client.region('side').view?.screen).toBe(ASSIGNED_ID);
    expect(client.region('modal')).toEqual(EMPTY_REGION);
  });
});

describe('PageClient.close — закрытие области', () => {
  test.each([
    ['side', ASSIGNED_ID],
    ['modal', CARD_ID],
  ] as const)(
    'close(%s): область пуста без заметки, экземпляр закрыт, снимок без записи, остальные не тронуты',
    async (region, screen) => {
      const { client, end } = await layered();
      const log = journal(client, region);
      const others = (['main', 'side', 'modal'] as const).filter(
        (name) => name !== region,
      );
      const before = others.map((name) => [name, client.region(name)] as const);

      client.close(region);

      expect(client.region(region)).toEqual(EMPTY_REGION);
      expect(statuses(log)).toEqual(['ready', 'empty']);
      expect(end.unwatches()).toEqual([watchOf(end, screen)]);
      expect(Object.keys(client.snapshot())).not.toContain(region);
      for (const [name, state] of before) {
        expect(client.region(name)).toBe(state);
      }
    },
  );

  test('close пустой области — без броска, область пуста', async () => {
    const { client } = await listed(answered());

    client.close('modal');
    client.close('side');

    expect(client.region('modal')).toEqual(EMPTY_REGION);
    expect(client.region('side')).toEqual(EMPTY_REGION);
  });

  test('закрытая область не помнит экрана: повторное открытие — с начального состояния', async () => {
    const { client } = tab(answered(), undefined, [
      { screen: TaskListScreenDef, region: 'side' },
    ]);
    await client.route('/');
    await client.openLink(LIST);
    await client.local('side', 'toggle', { taskId: 'Хлеб' });
    expect(client.region('side').view?.state).toEqual({ selected: [TASK_A] });

    client.close('side');
    await client.openLink(LIST);

    expect(client.region('side').view?.state).toEqual({ selected: [] });
    expect(client.region('side').view?.revision).toBe(1);
  });

  test('закрытие во время загрузки: область пуста, опоздавший экземпляр закрыт и не оживает', async () => {
    const end = answered().hold('listAssignedTasks');
    const { client } = tab(end, undefined, [
      { screen: AssignedTasksScreenDef, region: 'modal' },
    ]);
    await client.route('/');
    const opening = client.openLink(ASSIGNED);
    expect(client.region('modal').status).toBe('loading');

    client.close('modal');

    expect(client.region('modal')).toEqual(EMPTY_REGION);
    end.release('listAssignedTasks');
    await opening;
    await end.flush();
    expect(client.region('modal')).toEqual(EMPTY_REGION);
    expect(end.unwatches()).toEqual([watchOf(end, ASSIGNED_ID)]);
  });

  test('закрытие снимает ожидающее подтверждение: после close и повторного открытия подтверждать нечего', async () => {
    const { client } = tab(answered(), undefined, [
      { screen: TaskListScreenDef, region: 'side' },
    ]);
    await client.route('/');
    await client.openLink(LIST);
    await client.local('side', 'toggle', { taskId: 'Хлеб' });
    await client.submit('side', 'completeSelected', {});
    expect(client.region('side').confirm).toBeDefined();

    client.close('side');

    expect(client.region('side')).toEqual(EMPTY_REGION);
    await client.openLink(LIST);
    expect(client.region('side').confirm).toBeUndefined();
    expect(await client.confirm('side')).toEqual({
      kind: 'unavailable',
      reason: 'disabled',
    });
  });

  test('закрытие снимает замечания и введённое: у пустой области их нет, после повторного открытия тоже', async () => {
    const { client } = tab(answered(), undefined, [
      { screen: TaskListScreenDef, region: 'side' },
    ]);
    await client.route('/');
    await client.openLink(LIST);
    await client.submit('side', 'create', { title: '' });
    expect(client.region('side').issues).toHaveLength(1);
    expect(client.region('side').entered).toBeDefined();

    client.close('side');

    expect(client.region('side')).toEqual(EMPTY_REGION);
    await client.openLink(LIST);
    expect(client.region('side').issues).toEqual([]);
    expect(client.region('side').entered).toBeUndefined();
  });

  test('отложенный переход в закрываемую область вытеснен: его промис разрешён, после attach область пуста', async () => {
    const end = answered();
    const { client } = tab(end, undefined, CARD_IN_MODAL);
    await client.route('/');
    end.drop();
    const opening = client.openLink(CARD_LINK);
    expect(await soon(opening, end)).toBe('ждёт');

    client.close('modal');

    expect(await soon(opening, end)).toBe('разрешён');
    expect(client.region('modal')).toEqual(EMPTY_REGION);
    await client.attach(nextEnd());
    expect(client.region('modal')).toEqual(EMPTY_REGION);
  });
});

describe('PageClient — выход из экрана области и уход из окна', () => {
  test.each([
    ['modal', [{ screen: AssignedTasksScreenDef, region: 'modal' }]],
    ['side', undefined],
  ] as const)(
    'выход из экрана в %s: область пуста с заметкой из exits, main не тронута',
    async (region, placements) => {
      const { client } = tab(answered(), undefined, placements);
      await client.route('/');
      await client.openLink(ASSIGNED);
      expect(client.region(region).view?.screen).toBe(ASSIGNED_ID);
      const main = client.region('main');

      const outcome = await client.submit(region, 'close', {});

      expect(outcome).toMatchObject({ kind: 'exited', exit: 'closed' });
      expect(client.region(region)).toEqual({
        ...EMPTY_REGION,
        note: 'Поручения просмотрены',
      });
      expect(client.region('main')).toBe(main);
    },
  );

  test('уход из окна переходом: назначение открывается раньше, окно очищается после; side остаётся', async () => {
    const end = answered();
    const { client } = await layered(end);
    end.hold('listTasks');

    const going = client.submit('modal', 'back', {});
    await end.flush();

    expect(client.region('main').status).toBe('loading');
    expect(client.region('modal').view?.screen).toBe(CARD_ID);
    end.release('listTasks');
    await going;

    expect(client.region('main').view?.screen).toBe(LIST_ID);
    expect(client.region('modal')).toEqual(EMPTY_REGION);
    expect(client.region('side').view?.screen).toBe(ASSIGNED_ID);
    expect(end.unwatches()).toContain(watchOf(end, CARD_ID));
  });

  test('уход из side тем же переходом — side остаётся карточкой (область не временная)', async () => {
    const { client } = tab(answered(), undefined, [
      { screen: TaskCardScreenDef, region: 'side' },
    ]);
    await client.route('/');
    await client.submit('main', 'open', { taskId: 'Молоко' });

    await client.submit('side', 'back', {});

    expect(client.region('main').view?.screen).toBe(LIST_ID);
    expect(client.region('side').view?.screen).toBe(CARD_ID);
  });

  test('переход внутри окна на объявленный для окна экран — замена на месте, main не тронута', async () => {
    const { client, end } = tab(answered(), undefined, [
      { screen: TaskCardScreenDef, region: 'modal' },
      { screen: TaskListScreenDef, region: 'modal' },
    ]);
    await client.route('/');
    await client.submit('main', 'open', { taskId: 'Молоко' });
    const main = client.region('main');

    await client.submit('modal', 'back', {});

    expect(client.region('modal').view?.screen).toBe(LIST_ID);
    expect(client.region('main')).toBe(main);
    expect(end.unwatches()).toEqual([watchOf(end, CARD_ID)]);
  });

  test('окно не блокирует остальные области: действие main исполняется при открытом окне', async () => {
    const { client, end } = await layered();

    const outcome = await client.submit('main', 'create', { title: 'Хлеб' });

    expect(outcome).toMatchObject({ kind: 'exited', exit: 'created' });
    expect(end.names()).toContain('createTask');
    expect(client.region('modal').view?.screen).toBe(CARD_ID);
  });

  test('исход ушедшего экземпляра: окно закрыто до ответа — исход вызывающему, область не тронута', async () => {
    const end = answered().hold('assignTask');
    const { client } = await layered(end);
    const log = journal(client, 'modal');

    const acting = client.submit('modal', 'assign', {
      assigneeId: testUuid(2),
    });
    await end.flush();
    client.close('modal');
    end.release('assignTask');
    const outcome = await acting;
    await end.flush();

    expect(outcome.kind).toBe('stayed');
    expect(client.region('modal')).toEqual(EMPTY_REGION);
    expect(statuses(log)).toEqual(['ready', 'empty']);
  });
});

describe('PageClient — три области: обрыв, восстановление, сигналы', () => {
  test('обрыв: у каждой непустой области stale offline, журнал каждой это видит', async () => {
    const { client, end } = await layered();
    const logs = (['main', 'side', 'modal'] as const).map((name) =>
      journal(client, name),
    );

    end.drop();
    await end.flush();

    for (const name of ['main', 'side', 'modal'] as const) {
      expect(client.region(name)).toMatchObject({
        status: 'ready',
        stale: 'offline',
      });
    }
    for (const log of logs) {
      expect(log.at(-1)?.stale).toBe('offline');
      expect(log.length).toBeGreaterThan(1);
    }
  });

  test('обрыв: пустая область (окно) пометки не получает', async () => {
    const { client, end } = await listed(answered());
    await client.openLink(ASSIGNED);

    end.drop();
    await end.flush();

    expect(client.region('main').stale).toBe('offline');
    expect(client.region('side').stale).toBe('offline');
    expect(client.region('modal')).toEqual(EMPTY_REGION);
  });

  test('переход в окно без связи: окно в loading с пометкой, вызовов нет; после attach — окно открыто по новому концу', async () => {
    const end = answered();
    const { client, observer } = tab(end, undefined, CARD_IN_MODAL);
    await client.route('/');
    end.drop();

    const opening = client.openLink(CARD_LINK);

    expect(await soon(opening, end)).toBe('ждёт');
    expect(client.region('modal')).toMatchObject({
      status: 'loading',
      address: CARD_LINK,
      stale: 'offline',
    });
    expect(end.afterBreak).toEqual([]);
    expect(observer.kinds()).not.toContain('defect');
    const next = nextEnd();
    await client.attach(next);
    expect(await soon(opening, next)).toBe('разрешён');
    expect(client.region('modal')).toMatchObject({ status: 'ready' });
    expect(client.region('modal').view?.data).toMatchObject({ uuid: TASK_A });
    expect(client.region('modal').stale).toBeUndefined();
  });

  test('восстановление: после attach три экземпляра перечитаны по новому концу, пометки сняты, подписки на все три', async () => {
    const { client, end } = await layered();
    end.drop();
    const next = nextEnd();

    await client.attach(next);

    for (const name of ['main', 'side', 'modal'] as const) {
      const state = client.region(name);
      expect(state).toMatchObject({ status: 'ready', refreshing: false });
      expect(state.view?.revision).toBe(2);
      expect(state.stale).toBeUndefined();
    }
    expect(client.region('modal').view?.screen).toBe(CARD_ID);
    expect(next.watches()).toHaveLength(3);
    expect(next.names().sort()).toEqual([
      'listAssignedTasks',
      'listTasks',
      'listTasks',
    ]);
    expect(next.unwatches()).toEqual([]);
    expect(end.afterBreak).toEqual([]);
  });

  test('сигнал по адресу карточки: перечитывается только окно; промис ждёт и его; чужие области не трогает', async () => {
    const end = answered();
    const { client } = await layered(end);
    end.hold('listTasks');

    const delivered = end.deliver(signalOf(watchOf(end, CARD_ID), 'e-1'));

    expect(client.region('modal').refreshing).toBe(true);
    expect(client.region('main').refreshing).toBe(false);
    expect(client.region('side').refreshing).toBe(false);
    expect(await soon(delivered, end)).toBe('ждёт');
    end.release('listTasks');
    await delivered;
    expect(client.region('modal')).toMatchObject({ refreshing: false });
    expect(client.region('modal').view?.revision).toBe(2);
    expect(client.region('main').view?.revision).toBe(1);
    expect(client.region('side').view?.revision).toBe(1);
  });
});

describe('PageClient.resume — три области', () => {
  test('снимок трёх областей — три области восстановлены, подписки на все три', async () => {
    const first = await layered();
    const snapshot = first.client.snapshot();
    expect(Object.keys(snapshot).sort()).toEqual(['main', 'modal', 'side']);
    expect(JSON.parse(JSON.stringify(snapshot))).toStrictEqual(snapshot);
    const second = tab(answered());

    await second.client.resume(snapshot);

    expect(second.client.region('main').view?.screen).toBe(LIST_ID);
    expect(second.client.region('side').view?.screen).toBe(ASSIGNED_ID);
    expect(second.client.region('modal').view?.screen).toBe(CARD_ID);
    expect(second.client.region('modal').view?.data).toMatchObject({
      title: 'Молоко',
    });
    expect(second.end.watches()).toHaveLength(3);
  });

  test.each([
    { name: 'число', modal: 42 },
    { name: 'адрес-строка', modal: { address: 'мусор', revision: 1 } },
    {
      name: 'чужой экран',
      modal: { address: { screen: 'нет/такого', params: {} }, revision: 1 },
    },
  ])(
    'окно снимка — $name: окно пусто, main и side целы, без броска',
    async ({ modal }) => {
      const first = await layered();
      const second = tab(answered());

      await second.client.resume({ ...first.client.snapshot(), modal });

      expect(second.client.region('modal')).toEqual(EMPTY_REGION);
      expect(second.client.region('main').view?.screen).toBe(LIST_ID);
      expect(second.client.region('side').view?.screen).toBe(ASSIGNED_ID);
    },
  );

  test('мусор в main — вход start; side и окно восстановлены', async () => {
    const first = await layered();
    const second = tab(answered());

    await second.client.resume({ ...first.client.snapshot(), main: 42 });

    expect(second.client.region('main').view?.address).toEqual(LIST);
    expect(second.client.region('side').view?.screen).toBe(ASSIGNED_ID);
    expect(second.client.region('modal').view?.screen).toBe(CARD_ID);
  });

  test('resume без связи отложен: main в loading с пометкой, вызовов нет; после attach — вход start', async () => {
    const { client, end } = tab(answered());
    end.drop();

    const resuming = client.resume(42);

    expect(await soon(resuming, end)).toBe('ждёт');
    expect(client.region('main')).toMatchObject({
      status: 'loading',
      stale: 'offline',
    });
    expect(end.afterBreak).toEqual([]);
    const next = nextEnd();
    await client.attach(next);
    expect(await soon(resuming, next)).toBe('разрешён');
    expect(client.region('main').view?.address).toEqual(LIST);
  });
});

describe('PageClient.route — состав областей в ссылке', () => {
  test('/?_side=<карточка> — main по умолчанию и карточка в side', async () => {
    const { client, end } = tab(answered());

    await client.route(SIDE_CARD_URL);

    expect(client.region('main').view?.address).toEqual(LIST);
    expect(client.region('side').view?.address).toEqual(CARD_LINK);
    expect(client.region('modal')).toEqual(EMPTY_REGION);
    expect(end.watches()).toHaveLength(2);
  });

  test('_modal по умолчанию пропущен: окно не открывается', async () => {
    const { client } = tab(answered());
    const modal = encodeURIComponent('/assigned');

    await client.route(`/?_modal=${modal}`);

    expect(client.region('main').view?.screen).toBe(LIST_ID);
    expect(client.region('modal')).toEqual(EMPTY_REGION);
    expect(client.region('side')).toEqual(EMPTY_REGION);
  });

  test('следующий route без _side оставляет side: области вне ссылки не трогаются', async () => {
    const { client } = tab(answered());
    await client.route(SIDE_CARD_URL);
    const side = client.region('side');

    await client.route('/assigned');

    expect(client.region('main').view?.screen).toBe(ASSIGNED_ID);
    expect(client.region('side')).toBe(side);
  });

  test('_side неразборчив: main открыт, side пуста с заметкой «не найдено»', async () => {
    const { client } = tab(answered());

    await client.route(`/?_side=${encodeURIComponent('/нет/такого')}`);

    expect(client.region('main').view?.address).toEqual(LIST);
    expect(client.region('side')).toEqual({
      ...EMPTY_REGION,
      note: PAGE_NOTES.notFound,
    });
  });

  test('_side со значением параметра не по схеме — side пуста с заметкой, main открыт', async () => {
    const { client } = tab(answered());

    await client.route(
      `/?_side=${encodeURIComponent('/todo/taskCard?taskId=не-uuid')}`,
    );

    expect(client.region('main').view?.screen).toBe(LIST_ID);
    expect(client.region('side')).toEqual({
      ...EMPTY_REGION,
      note: PAGE_NOTES.notFound,
    });
  });

  test('внешняя ссылка неразборчива: вход start с заметкой, область из ссылки не открывается', async () => {
    const { client } = tab(answered());

    await client.route(`/нет${SIDE_CARD_URL.slice(1)}`);

    expect(client.region('main')).toMatchObject({
      status: 'ready',
      address: LIST,
      note: PAGE_NOTES.notFound,
    });
    expect(client.region('side')).toEqual(EMPTY_REGION);
  });

  test('код экрана области не загрузился: промис отклонён только после завершения остальных открытий', async () => {
    const { codes, broken } = breakable();
    broken.add('taskCard');
    const end = answered().hold('listTasks');
    const { client } = tab(end, codes);

    const routing = client.route(SIDE_CARD_URL);

    expect(await soon(routing, end)).toBe('ждёт');
    end.release('listTasks');
    await expect(routing).rejects.toThrow('код taskCard не загрузился');
    expect(client.region('main').view?.screen).toBe(LIST_ID);
    expect(client.region('side')).toMatchObject({
      status: 'empty',
      note: PAGE_NOTES.failed,
    });
  });
});

describe('PageClient.url — ссылка по состоянию областей', () => {
  test('main пуста — undefined', () => {
    expect(tab(answered()).client.url()).toBeUndefined();
  });

  test('только main — путь адреса', async () => {
    const { client } = await listed(answered());

    expect(client.url()).toBe('/');
  });

  test('список и карточка в side — ссылка с _side', async () => {
    const { client } = await listed(answered());
    await client.openLink(CARD_LINK);

    expect(client.url()).toBe(SIDE_CARD_URL);
  });

  test('страница списка и карточка — запрос main первым, затем _side', async () => {
    const { client } = await listed(answered());
    await client.submit('main', 'next', {});
    await client.openLink(CARD_LINK);

    expect(client.url()).toBe(
      `/?page=1&_side=${encodeURIComponent(`/todo/taskCard?taskId=${TASK_A}`)}`,
    );
  });

  test('окно в ссылку не попадает', async () => {
    const { client } = tab(answered(), undefined, CARD_IN_MODAL);
    await client.route('/');
    await client.submit('main', 'open', { taskId: 'Молоко' });
    expect(client.region('modal').view?.screen).toBe(CARD_ID);

    expect(client.url()).toBe('/');
  });

  test('круг url() → route в новой вкладке даёт те же адреса областей', async () => {
    const first = await listed(answered());
    await first.client.submit('main', 'next', {});
    await first.client.openLink(CARD_LINK);
    const url = first.client.url();
    if (url === undefined) throw new Error('ссылки нет');
    const second = tab(answered());

    await second.client.route(url);

    expect(second.client.region('main').address).toEqual(
      first.client.region('main').address,
    );
    expect(second.client.region('side').address).toEqual(
      first.client.region('side').address,
    );
    expect(second.client.region('modal')).toEqual(EMPTY_REGION);
  });
});

describe('PageClient — сборка с размещением', () => {
  const Stray = ScreenDef.define({
    name: 'stray',
    label: 'Чужой',
    description: 'Экран вне набора.',
    reads: [],
    data: v.object({}),
  });

  test('экран вне набора в placements — бросок сборки', () => {
    expect(() =>
      tab(undefined, undefined, [{ screen: Stray, region: 'side' }]),
    ).toThrow('PageClient:');
  });

  test('один экран дважды — бросок сборки', () => {
    expect(() =>
      tab(undefined, undefined, [
        { screen: TaskCardScreenDef, region: 'modal' },
        { screen: TaskCardScreenDef, region: 'side' },
      ]),
    ).toThrow('PageClient:');
  });
});

// Форма целиком и жест. Отвергнутый вход возвращается состоянием области
// (`issues` с полем и `entered` — введённое), подтверждение — свойство
// действия и идёт исходом `confirm`, жест — готовый вход действия минуя сборку
// из строк формы.

/** Форма с подтверждением и полем с проверкой: учебный пример такого действия не имеет. */
const RewriteScreenDef = ScreenDef.define({
  name: 'rewrite',
  label: 'Переписать',
  description: 'Поле названия и подтверждение.',
  reads: [],
  data: v.object({}),
  actions: {
    rewrite: {
      label: 'Переписать',
      description: 'Название сменится.',
      input: v.object({
        title: v.pipe(
          v.string(),
          v.maxLength(5, 'Не длиннее 5 знаков'),
          v.description('Название'),
        ),
      }),
      confirm: { label: 'Переписать?', description: 'Название сменится.' },
    },
  },
});

class RewriteCode extends ScreenCode<typeof RewriteScreenDef> {
  /** Названия, с которыми действие дошло до шага `done`. */
  readonly written: string[] = [];

  override readonly actions: Partial<ActionSteps<typeof RewriteScreenDef>> = {
    rewrite: {
      done: ({ input }) => {
        this.written.push(input.title);
        return RewriteScreenDef.at({});
      },
    },
  };

  override async load(): Promise<Result<Record<string, never>, DomainError>> {
    return ok({});
  }
}

const RewriteUiModuleDef = UiModuleDef.define({
  name: 'forms',
  label: 'Формы',
  description: 'Одна форма.',
  screens: [RewriteScreenDef],
  stories: [],
});

const RewriteSetDef = UiSetDef.define({
  name: 'rewriteUi',
  label: 'Набор формы',
  description: 'Локальный экран формы с подтверждением.',
  app: ExampleAppDef,
  modules: [RewriteUiModuleDef],
});

const RewriteAppDef = UiAppDef.define({
  name: 'rewritePages',
  label: 'Форма на страницах',
  description: 'Приложение страниц одной формы с подтверждением.',
  set: RewriteSetDef,
  channel: PAGE_CHANNEL,
  stories: [],
  entries: {
    start: {
      label: 'Форма',
      description: 'Форма с подтверждением.',
      address: RewriteScreenDef.at({}),
    },
  },
});

/** Вкладка формы с подтверждением: форма открыта в `main`. */
const rewriting = async () => {
  const code = new RewriteCode();
  const end = new StubEnd();
  const client = new PageClient({
    app: RewriteAppDef,
    codes: AppCodeLoaders.of(RewriteAppDef, [
      CodeLoaders.of(RewriteUiModuleDef, [
        CodeLoader.screen(RewriteScreenDef, async () => code),
      ]),
    ]),
    routes: [],
    end,
    observer: new MemoryUiObserver(),
    clock: new ManualPageClock(),
  });
  await client.route('/forms/rewrite');
  return { client, end, code };
};

/** Подставная цель жеста: помнит последнее состояние области и «роняет» на неё значение варианта. */
class DropTarget {
  state: PageViewState;

  constructor(
    private readonly client: PageClient,
    private readonly region: PageRegionName,
    private readonly action: string,
    private readonly field: string,
  ) {
    this.state = client.region(region);
    client.source(region).subscribe((state) => {
      this.state = state;
    });
  }

  /** Ревизия вида, по которому нарисована цель, уходит вместе с жестом. */
  drop(value: string) {
    return this.client.submitInput(
      this.region,
      this.action,
      { [this.field]: value },
      this.state.view?.revision ?? 0,
    );
  }
}

describe('PageClient — форма: введённое и замечания', () => {
  test('отвергнутый вход: issues с полем и текстом, entered с введённым; вызов UC не ушёл', async () => {
    const end = answered();
    const { client } = await listed(end);

    const outcome = await client.submit('main', 'create', { title: '' });

    expect(outcome).toMatchObject({ kind: 'rejected' });
    expect(client.region('main').issues).toEqual([
      { field: 'title', text: 'Название не может быть пустым' },
    ]);
    expect(client.region('main').entered).toEqual({
      kind: 'action',
      name: 'create',
      values: { title: '' },
    });
    expect(end.names()).not.toContain('createTask');
  });

  test('следующий вход снимает замечания и введённое', async () => {
    const { client } = await listed(answered());
    await client.submit('main', 'create', { title: '' });

    await client.submit('main', 'create', { title: 'Хлеб' });

    expect(client.region('main').issues).toEqual([]);
    expect(client.region('main').entered).toBeUndefined();
  });

  test('локальное действие снимает замечания и введённое прежней формы', async () => {
    const { client } = await listed(answered());
    await client.submit('main', 'create', { title: '' });

    await client.local('main', 'toggle', { taskId: 'Хлеб' });

    expect(client.region('main').issues).toEqual([]);
    expect(client.region('main').entered).toBeUndefined();
  });

  test('в entered — только объявленные поля формы: чужие ключи значений отброшены', async () => {
    const { client } = await listed(answered());

    await client.submit('main', 'create', { title: '', lost: 'чужое' });

    expect(client.region('main').entered).toEqual({
      kind: 'action',
      name: 'create',
      values: { title: '' },
    });
  });

  test('локальное действие отвергнуто: entered.kind — local, введённое по полям', async () => {
    const { client, end } = await listed(answered());

    const outcome = await client.local('main', 'toggle', { taskId: 'нет' });

    expect(outcome).toMatchObject({ kind: 'rejected' });
    expect(client.region('main').entered).toEqual({
      kind: 'local',
      name: 'toggle',
      values: { taskId: 'нет' },
    });
    expect(client.region('main').issues).toHaveLength(1);
    expect(end.names()).toEqual(['listTasks']);
  });

  test('entered есть у области, чьё действие отвергнуто, и только у неё', async () => {
    const { client } = await layered();

    await client.submit('modal', 'assign', { assigneeId: 'не-uuid' });

    expect(client.region('modal').entered).toEqual({
      kind: 'action',
      name: 'assign',
      values: { assigneeId: 'не-uuid' },
    });
    expect(client.region('main').entered).toBeUndefined();
    expect(client.region('side').entered).toBeUndefined();
  });

  test('значения формы с вариантами — подписи — в entered как введены, не значениями', async () => {
    const { client } = await listed(answered());

    await client.local('main', 'toggle', { taskId: 'Нет такой задачи' });

    expect(client.region('main').entered).toEqual({
      kind: 'local',
      name: 'toggle',
      values: { taskId: 'Нет такой задачи' },
    });
  });

  test('введённое и текст замечания не попадают в журнал исполнителя и в faults', async () => {
    const { client, observer, faults } = await layered();

    await client.submit('modal', 'assign', { assigneeId: 'секрет-не-uuid' });

    expect(client.region('modal').entered?.values).toEqual({
      assigneeId: 'секрет-не-uuid',
    });
    expect(JSON.stringify(observer.records)).not.toContain('секрет-не-uuid');
    expect(faults).toEqual([]);
  });

  test('подтверждение, затем отказ входа: confirm(region) показывает замечания и введённое из ожидающего подтверждения', async () => {
    const { client, code } = await rewriting();

    const asked = await client.submit('main', 'rewrite', {
      title: 'слишком длинное',
    });

    expect(asked).toMatchObject({ kind: 'confirm' });
    expect(client.region('main').confirm).toEqual({
      action: 'rewrite',
      label: 'Переписать?',
      description: 'Название сменится.',
    });
    expect(client.region('main').issues).toEqual([]);
    expect(client.region('main').entered).toBeUndefined();

    const rejected = await client.confirm('main');

    expect(rejected).toMatchObject({ kind: 'rejected' });
    expect(client.region('main').issues).toEqual([
      { field: 'title', text: 'Не длиннее 5 знаков' },
    ]);
    expect(client.region('main').entered).toEqual({
      kind: 'action',
      name: 'rewrite',
      values: { title: 'слишком длинное' },
    });
    expect(client.region('main').confirm).toBeUndefined();
    expect(code.written).toEqual([]);
  });

  test('подтверждение с верным входом: confirm(region) исполняет, подтверждение снято', async () => {
    const { client, code } = await rewriting();
    await client.submit('main', 'rewrite', { title: 'ок' });

    const done = await client.confirm('main');

    expect(done).toMatchObject({ kind: 'stayed' });
    expect(code.written).toEqual(['ок']);
    expect(client.region('main').confirm).toBeUndefined();
    expect(client.region('main').entered).toBeUndefined();
  });

  test('подтверждение — свойство действия: недоступное без выбора, после выбора submit даёт confirm с текстами Def, confirm исполняет', async () => {
    const { client, end } = await listed(answered());

    expect(await client.submit('main', 'completeSelected', {})).toMatchObject({
      kind: 'unavailable',
      reason: 'disabled',
    });
    await client.local('main', 'toggle', { taskId: 'Хлеб' });

    const asked = await client.submit('main', 'completeSelected', {});

    expect(asked).toMatchObject({ kind: 'confirm' });
    expect(client.region('main').confirm).toEqual({
      action: 'completeSelected',
      label: 'Выполнить выбранные задачи?',
      description: 'Выполненную задачу нельзя вернуть в работу.',
    });
    expect(end.names()).not.toContain('completeTasks');
    expect(await client.confirm('main')).toMatchObject({ kind: 'stayed' });
    expect(end.names()).toContain('completeTasks');
  });
});

describe('PageClient.submitInput — жест: готовый вход действия', () => {
  test('значение варианта уходит как есть: карточка в side, область main не перечитана', async () => {
    const { client, end } = await listed(answered());
    const target = new DropTarget(client, 'main', 'open', 'taskId');
    const list = client.region('main');

    const outcome = await target.drop(TASK_B);

    expect(outcome).toMatchObject({ kind: 'moved' });
    expect(client.region('side').view?.address).toEqual({
      screen: CARD_ID,
      params: { taskId: TASK_B },
    });
    expect(client.region('side').view?.data).toMatchObject({
      title: 'Молоко',
    });
    expect(client.region('main')).toEqual(list);
    expect(client.region('main').view?.revision).toBe(1);
    expect(end.unwatches()).toEqual([]);
  });

  test('жест минует сборку формы: значение, совпавшее с подписью, не превращается в значение варианта', async () => {
    const { client } = await listed(answered());
    const target = new DropTarget(client, 'main', 'open', 'taskId');

    const outcome = await target.drop('Молоко');

    expect(outcome).toMatchObject({ kind: 'rejected' });
    expect(client.region('side')).toEqual(EMPTY_REGION);
  });

  test('та же строка через форму — подпись заменяется значением варианта', async () => {
    const { client } = await listed(answered());

    await client.submit('main', 'open', { taskId: 'Молоко' });

    expect(client.region('side').view?.address).toEqual({
      screen: CARD_ID,
      params: { taskId: TASK_B },
    });
  });

  test('жест в окно: действие карточки в modal исполняется с готовым входом', async () => {
    const { client, end } = await layered();
    const target = new DropTarget(client, 'modal', 'assign', 'assigneeId');

    const outcome = await target.drop(testUuid(2));

    expect(outcome).toMatchObject({ kind: 'stayed' });
    expect(end.calls().find((c) => c.uc === 'assignTask')).toMatchObject({
      input: { taskId: TASK_B, assigneeId: testUuid(2) },
    });
  });

  test('устаревшая ревизия: список перечитан между захватом и броском — stale, заметка, карточка не открыта', async () => {
    const end = answered();
    const { client } = await listed(end);
    const target = new DropTarget(client, 'main', 'open', 'taskId');
    const captured = target.state.view?.revision;
    end.emit(signalOf(watchOf(end, LIST_ID), 'e-1'));
    await end.flush();
    expect(client.region('main').view?.revision).toBe(2);

    const outcome = await client.submitInput(
      'main',
      'open',
      { taskId: TASK_B },
      captured ?? 0,
    );

    expect(outcome).toMatchObject({ kind: 'stale' });
    expect(client.region('main')).toMatchObject({
      note: PAGE_NOTES.stale,
      stale: 'revision',
    });
    expect(client.region('side')).toEqual(EMPTY_REGION);
  });

  test('цель обновилась после перечитывания — жест по свежей ревизии проходит', async () => {
    const end = answered();
    const { client } = await listed(end);
    const target = new DropTarget(client, 'main', 'open', 'taskId');
    end.emit(signalOf(watchOf(end, LIST_ID), 'e-1'));
    await end.flush();

    const outcome = await target.drop(TASK_B);

    expect(outcome).toMatchObject({ kind: 'moved' });
  });

  test('жест без связи: unavailable disabled, на провод ничего', async () => {
    const { client, end } = await listed(answered());
    const target = new DropTarget(client, 'main', 'open', 'taskId');
    end.drop();

    const outcome = await target.drop(TASK_B);

    expect(outcome).toEqual({ kind: 'unavailable', reason: 'disabled' });
    expect(end.afterBreak).toEqual([]);
  });

  test('жест в закрытую область: unavailable closed', async () => {
    const { client } = await listed(answered());

    const outcome = await client.submitInput(
      'side',
      'open',
      { taskId: TASK_B },
      1,
    );

    expect(outcome).toEqual({ kind: 'unavailable', reason: 'closed' });
    expect(client.region('side').note).toBe(PAGE_NOTES.closed);
  });

  test('жест: отказ входа — замечания есть, введённого нет', async () => {
    const { client } = await listed(answered());
    const target = new DropTarget(client, 'main', 'create', 'title');

    const outcome = await target.drop('');

    expect(outcome).toMatchObject({ kind: 'rejected' });
    expect(client.region('main').issues).toEqual([
      { field: 'title', text: 'Название не может быть пустым' },
    ]);
    expect(client.region('main').entered).toBeUndefined();
  });

  test('жест на недоступное действие — unavailable disabled от ядра, вызова нет', async () => {
    const { client, end } = await listed(answered());

    const outcome = await client.submitInput('main', 'completeSelected', {}, 1);

    expect(outcome).toEqual({ kind: 'unavailable', reason: 'disabled' });
    expect(end.names()).toEqual(['listTasks']);
  });

  test('жест на действие с подтверждением: confirm, затем confirm(region) исполняет с тем же готовым входом', async () => {
    const { client, code } = await rewriting();
    const target = new DropTarget(client, 'main', 'rewrite', 'title');

    const asked = await target.drop('ок');

    expect(asked).toMatchObject({ kind: 'confirm' });
    expect(client.region('main').confirm).toMatchObject({
      action: 'rewrite',
    });
    expect(code.written).toEqual([]);
    expect(await client.confirm('main')).toMatchObject({ kind: 'stayed' });
    expect(code.written).toEqual(['ок']);
  });

  test('жест по действию окна, пока main грузится: исход окна, main не тронута', async () => {
    const end = answered();
    const { client } = await layered(end);
    end.hold('listAssignedTasks');
    const routing = client.route('/assigned');
    expect(client.region('main').status).toBe('loading');
    const target = new DropTarget(client, 'modal', 'assign', 'assigneeId');

    const outcome = await target.drop(testUuid(2));

    expect(outcome).toMatchObject({ kind: 'stayed' });
    expect(client.region('main').status).toBe('loading');
    end.release('listAssignedTasks');
    await routing;
    expect(client.region('main').view?.screen).toBe(ASSIGNED_ID);
  });
});

describe('PageClient — состояние области с введённым остаётся данными JSON', () => {
  test('на каждом значении журнала трёх областей, включая entered: JSON-копия равна, значение не меняется после выдачи; в снимок entered не входит', async () => {
    const { client } = tab(answered(), undefined, CARD_IN_MODAL);
    const seen: { state: PageViewState; json: string }[] = [];
    for (const region of ['main', 'side', 'modal'] as const) {
      client.source(region).subscribe((state) => {
        seen.push({ state, json: JSON.stringify(state) });
      });
    }

    await client.route('/');
    await client.submit('main', 'open', { taskId: 'Молоко' });
    await client.openLink(ASSIGNED);
    await client.submit('main', 'create', { title: '' });
    await client.local('main', 'toggle', { taskId: 'нет' });
    await client.submit('modal', 'assign', { assigneeId: 'не-uuid' });
    await client.submit('main', 'create', { title: 'Хлеб' });

    const kinds = seen.map((s) => s.state.entered?.kind);
    expect(kinds).toContain('action');
    expect(kinds).toContain('local');
    for (const { state, json } of seen) {
      expect(JSON.parse(json)).toEqual(state);
      expect(JSON.stringify(state)).toBe(json);
    }
    expect(JSON.stringify(client.snapshot())).not.toContain('entered');
  });
});

describe('PageClient — отказ route, окно при уходе, resume без восстановления, введённое', () => {
  test('route: сломан код экранов main и side — отклонён первой причиной, причиной main', async () => {
    const { codes, broken } = breakable();
    broken.add('taskList');
    broken.add('taskCard');
    const { client } = tab(answered(), codes);

    await expect(client.route(SIDE_CARD_URL)).rejects.toThrow(
      'код taskList не загрузился',
    );
  });

  test('уход из окна: окно, переоткрытое за время ожидания назначения, не закрывается', async () => {
    const end = answered();
    const { client } = tab(end, undefined, [
      { screen: TaskCardScreenDef, region: 'modal' },
      { screen: AssignedTasksScreenDef, region: 'modal' },
    ]);
    await client.route('/');
    await client.submit('main', 'open', { taskId: 'Молоко' });
    end.hold('listTasks');

    const going = client.submit('modal', 'back', {});
    await end.flush();
    expect(client.region('main').status).toBe('loading');
    client.close('modal');
    await client.openLink(ASSIGNED);
    expect(client.region('modal').view?.screen).toBe(ASSIGNED_ID);
    end.release('listTasks');
    await going;

    expect(client.region('main').view?.screen).toBe(LIST_ID);
    expect(client.region('modal').view?.screen).toBe(ASSIGNED_ID);
  });

  describe('resume: адрес декодируется, но экземпляр не восстановлен', () => {
    /** Снимок трёх областей, у выбранных ревизия испорчена: адрес читается, `restore` отказывает. */
    const spoiled = async (regions: readonly PageRegionName[]) => {
      const snapshot = (await layered()).client.snapshot();
      const patched: Record<string, unknown> = { ...snapshot };
      for (const name of regions) {
        patched[name] = { ...snapshot[name], revision: 'x' };
      }
      return patched;
    };

    test('side и modal — обе пусты, не в loading; main восстановлена', async () => {
      const second = tab(answered());

      await second.client.resume(await spoiled(['side', 'modal']));

      expect(second.client.region('side')).toEqual(EMPTY_REGION);
      expect(second.client.region('modal')).toEqual(EMPTY_REGION);
      expect(second.client.region('main').view?.screen).toBe(LIST_ID);
    });

    test('main — вход start, не loading; прочие восстановлены', async () => {
      const second = tab(answered());

      await second.client.resume(await spoiled(['main']));

      expect(second.client.region('main').status).toBe('ready');
      expect(second.client.region('main').view?.address).toEqual(LIST);
      expect(second.client.region('side').view?.screen).toBe(ASSIGNED_ID);
      expect(second.client.region('modal').view?.screen).toBe(CARD_ID);
    });
  });

  test('local с лишним ключом: в entered.values только объявленные поля', async () => {
    const { client } = await listed(answered());

    await client.local('main', 'toggle', { taskId: 'нет', лишнее: 'x' });

    expect(client.region('main').entered).toEqual({
      kind: 'local',
      name: 'toggle',
      values: { taskId: 'нет' },
    });
  });

  test('submit без значения поля: в entered.values ключа нет, форма показывает начальное', async () => {
    const { client } = await listed(answered());

    const outcome = await client.submit('main', 'create', {});

    expect(outcome).toMatchObject({ kind: 'rejected' });
    expect(client.region('main').entered).toEqual({
      kind: 'action',
      name: 'create',
      values: {},
    });
    const create = new PageFormModel(ExampleUiSetDef)
      .of(client.region('main'))
      .forms.find((form) => form.name === 'create');
    expect(create?.fields.find((f) => f.name === 'title')?.value).toBe(
      'Новая задача',
    );
  });
});

// История вкладки: порт `history` в сборке клиента. Шаг (новая запись) —
// смена экрана корневой области и открытие панели либо окна (запись с `over`;
// каждая новая запись — `depth` на единицу больше): исход `moved` и `exited`,
// ссылка уведомления, `route`. Закрытие панели или окна, если текущую запись
// положило их открытие, — движение назад по истории, новой записи нет; без
// `over` — замена. Листание, выбор, действия внутри слоя — замена. Запись —
// строка JSON `{"version":1,"regions":…}` со снимком областей и метками; URL —
// `url()`. «Назад» и «Вперёд» ставят области по URL и записи, перезагрузка —
// `boot()` тем же путём. Порт — подставная история: `back()`/`forward()`
// ждут клиента.

/** Запись истории как её пишет клиент. */
type HistoryRecordJson = {
  readonly version: number;
  readonly regions: Readonly<Record<string, PageSlotJson>>;
  readonly depth?: number;
  readonly over?: boolean;
};

const CARD_B = { screen: CARD_ID, params: { taskId: TASK_B } };
const CARD_C = { screen: CARD_ID, params: { taskId: TASK_C } };
const sideUrl = (path: string, query = '/') =>
  `${query}${query.includes('?') ? '&' : '?'}_side=${encodeURIComponent(path)}`;
const SIDE_B_URL = sideUrl(`/todo/taskCard?taskId=${TASK_B}`);
const ASSIGNED_IN_MODAL: readonly PagePlacement[] = [
  { screen: AssignedTasksScreenDef, region: 'modal' },
];

/** Разобранная запись истории `at` (по умолчанию — текущая). */
const recordAt = (
  history: MemoryPageHistory,
  at = history.position,
): HistoryRecordJson => {
  const record = history.entries()[at]?.record;
  if (typeof record !== 'string') {
    throw new Error(`запись ${at} не строка: ${String(record)}`);
  }
  return JSON.parse(record);
};

/** Области записи истории `at` по порядку имён. */
const regionsAt = (history: MemoryPageHistory, at = history.position) =>
  Object.keys(recordAt(history, at).regions).sort();

const urlsOf = (history: MemoryPageHistory) =>
  history.entries().map((entry) => entry.url);

/** Метки записи истории `at`: сколько своих записей позади и положена ли она открытием слоя. */
const marksAt = (history: MemoryPageHistory, at = history.position) =>
  PageHistoryRecord.marks(history.entries()[at]?.record);

/** Строка записи истории со слотами `regions`, как её пишет клиент. */
const recordOf = (regions: Readonly<Record<string, unknown>>) =>
  JSON.stringify({ version: 1, regions });

/** Вкладка с историей после первой загрузки по текущей записи. */
const booted = async (
  history = new MemoryPageHistory('/'),
  placements?: readonly PagePlacement[],
  end = answered(),
) => {
  const t = tab(end, undefined, placements, history);
  await t.client.boot();
  return { ...t, history };
};

/** Список с выбором A, затем страница поручений: корень сменился — две записи. */
const stepped = async () => {
  const t = await booted();
  await t.client.local('main', 'toggle', { taskId: 'Хлеб' });
  await t.client.route('/assigned');
  return t;
};

/** Поручение с исполнителем: у «Назначенные мне» появляется карточка исполнителя. */
const ASSIGNEE_ROW = {
  ...stateOf(TASK_A, 'Хлеб', 'open'),
  ownerId: testUuid(9),
  assignment: { assigneeId: SUBJECT_ID, assignedAt: AT },
};
const MENU_ID = 'exampleUi/todo/mainMenu';
const USER_CARD_ID = 'exampleUi/users/userCard';
const MENU_IN_MODAL: readonly PagePlacement[] = [
  { screen: MainMenuScreenDef, region: 'modal' },
];

/**
 * Вторая модуль-фикстура: два UI-модуля поверх учебного приложения. Список
 * людей (`roster`) с параметром страницы, состоянием фильтра и переходом в
 * карточку другого модуля (`cards`); у карточки нет ни выхода, ни «Назад».
 * Строка поиска в адресе — необязательный параметр: одиночный суррогат в ней
 * не выражается в URL.
 */
const ProfileScreenDef = ScreenDef.define({
  name: 'profile',
  label: 'Человек',
  description: 'Карточка человека: ни выхода, ни возврата.',
  params: v.strictObject({
    personId: v.pipe(v.string(), v.description('Человек')),
  }),
  reads: [],
  data: v.object({}),
});

const PeopleScreenDef = ScreenDef.define({
  name: 'people',
  label: 'Люди',
  description: 'Список людей по страницам с фильтром.',
  params: v.strictObject({
    page: v.pipe(
      v.number(),
      v.integer(),
      v.minValue(0),
      v.description('Страница списка'),
    ),
    query: v.optional(v.pipe(v.string(), v.description('Строка поиска'))),
  }),
  reads: [],
  data: v.object({}),
  state: v.strictObject({
    filter: v.pipe(v.string(), v.description('Фильтр списка')),
  }),
  actions: {
    open: {
      label: 'Открыть',
      description: 'Карточка человека.',
      input: v.object({
        personId: v.pipe(v.string(), v.description('Человек')),
      }),
      to: (): readonly AnyScreenDef[] => [ProfileScreenDef],
    },
    find: {
      label: 'Найти',
      description: 'Тот же список со строкой поиска.',
      input: v.object({
        query: v.pipe(v.string(), v.description('Строка поиска')),
      }),
    },
  },
  locals: {
    mark: {
      label: 'Отфильтровать',
      description: 'Фильтр списка без вызова на сервер.',
      input: v.object({
        filter: v.pipe(v.string(), v.description('Фильтр списка')),
      }),
    },
  },
});

class PeopleCode extends ScreenCode<typeof PeopleScreenDef> {
  override readonly locals = {
    mark: (_state: unknown, _data: unknown, input: { filter: string }) => ({
      filter: input.filter,
    }),
  };

  override readonly actions: Partial<ActionSteps<typeof PeopleScreenDef>> = {
    open: { done: ({ input }) => ProfileScreenDef.at(input) },
    find: {
      done: ({ params, input }) =>
        PeopleScreenDef.at({ page: params.page, query: input.query }),
    },
  };

  override async load(): Promise<Result<Record<string, never>, DomainError>> {
    return ok({});
  }

  override initialState(): { filter: string } {
    return { filter: '' };
  }
}

class ProfileCode extends ScreenCode<typeof ProfileScreenDef> {
  override async load(): Promise<Result<Record<string, never>, DomainError>> {
    return ok({});
  }
}

const RosterUiModuleDef = UiModuleDef.define({
  name: 'roster',
  label: 'Люди',
  description: 'Список людей.',
  screens: [PeopleScreenDef],
  stories: [],
});

const CardsUiModuleDef = UiModuleDef.define({
  name: 'cards',
  label: 'Карточки',
  description: 'Карточка человека.',
  screens: [ProfileScreenDef],
  stories: [],
});

const RosterSetDef = UiSetDef.define({
  name: 'rosterUi',
  label: 'Набор людей',
  description: 'Два UI-модуля: список людей и карточки.',
  app: ExampleAppDef,
  modules: [RosterUiModuleDef, CardsUiModuleDef],
});

/** Вход на карточку вводит модуль `cards` в приложение (модули области). */
const RosterAppDef = UiAppDef.define({
  name: 'rosterPages',
  label: 'Люди на страницах',
  description: 'Приложение страниц двух UI-модулей.',
  set: RosterSetDef,
  channel: PAGE_CHANNEL,
  stories: [],
  entries: {
    start: {
      label: 'Люди',
      description: 'Список людей с начала.',
      address: PeopleScreenDef.at({ page: 0 }),
    },
    profile: {
      label: 'Человек',
      description: 'Карточка человека.',
      address: ProfileScreenDef.at({ personId: 'p-1' }),
    },
  },
});

const PEOPLE_ID = 'rosterUi/roster/people';
const PROFILE_ID = 'rosterUi/cards/profile';

/** Вкладка фикстуры с историей после первой загрузки; карточка — в `main`. */
const rostered = async (history: MemoryPageHistory, faults: UiFault[] = []) => {
  const client = new PageClient({
    app: RosterAppDef,
    codes: AppCodeLoaders.of(RosterAppDef, [
      CodeLoaders.of(RosterUiModuleDef, [
        CodeLoader.screen(PeopleScreenDef, async () => new PeopleCode()),
      ]),
      CodeLoaders.of(CardsUiModuleDef, [
        CodeLoader.screen(ProfileScreenDef, async () => new ProfileCode()),
      ]),
    ]),
    routes: [{ path: '/', entry: 'start' }],
    end: new StubEnd(),
    placements: [{ screen: ProfileScreenDef, region: 'main' }],
    observer: new MemoryUiObserver(),
    clock: new ManualPageClock(),
    history,
    faults: (fault) => faults.push(fault),
  });
  await client.boot();
  return client;
};

describe('PageClient — история: шаг и замена', () => {
  test('boot на / без записи — список в main; одна запись со слотом main после готовности; новых записей нет', async () => {
    const history = new MemoryPageHistory('/');
    const { client } = tab(answered(), undefined, undefined, history);

    await client.boot();

    expect(client.region('main').view?.address).toEqual(LIST);
    expect(urlsOf(history)).toEqual(['/']);
    expect(recordAt(history)).toEqual({
      version: 1,
      regions: {
        main: { address: LIST, revision: 1, state: { selected: [] } },
      },
    });
    expect(history.pushes).toBe(0);
  });

  test('локальное действие — та же запись заменена новым состоянием; записей одна', async () => {
    const { client, history } = await booted();

    await client.local('main', 'toggle', { taskId: 'Хлеб' });

    expect(urlsOf(history)).toEqual(['/']);
    expect(recordAt(history).regions.main?.state).toEqual({
      selected: [TASK_A],
    });
    expect(history.pushes).toBe(0);
  });

  test('листание — другие параметры того же экрана — замена: запись одна, URL новый, шага нет', async () => {
    const { client, history } = await booted();
    await client.local('main', 'toggle', { taskId: 'Хлеб' });

    await client.submit('main', 'next', {});

    expect(urlsOf(history)).toEqual(['/?page=1']);
    expect(history.pushes).toBe(0);
    expect(history.position).toBe(0);
    expect(recordAt(history).regions.main).toEqual({
      address: { screen: LIST_ID, params: { page: 1 } },
      revision: 1,
      state: { selected: [] },
    });
  });

  test('смена экрана корня — новая запись; у прежней — уходящее состояние; метки: depth 1, без over', async () => {
    const { history } = await stepped();

    expect(urlsOf(history)).toEqual(['/', '/assigned']);
    expect(recordAt(history, 0).regions.main?.state).toEqual({
      selected: [TASK_A],
    });
    expect(recordAt(history, 1).regions.main?.address).toEqual(ASSIGNED);
    expect(history.position).toBe(1);
    expect(marksAt(history)).toEqual({ depth: 1, over: false });
  });

  test('карточка рядом — новая запись с _side; у прежней слота side нет', async () => {
    const { client, history } = await booted();

    await client.submit('main', 'open', { taskId: 'Молоко' });

    expect(urlsOf(history)).toEqual(['/', SIDE_B_URL]);
    expect(regionsAt(history, 0)).toEqual(['main']);
    expect(regionsAt(history, 1)).toEqual(['main', 'side']);
    expect(recordAt(history).regions.side?.address).toEqual(CARD_B);
  });

  test('открытие панели — запись с over и depth 1; прежняя — без меток слоя', async () => {
    const { client, history } = await booted();

    await client.submit('main', 'open', { taskId: 'Молоко' });

    expect(marksAt(history)).toEqual({ depth: 1, over: true });
    expect(marksAt(history, 0)).toEqual({ depth: 0, over: false });
  });

  test('close(side) при записи открытия — движение назад: записей не прибавилось, side пуста, main — тот же объект', async () => {
    const { client, end, history } = await booted();
    await client.submit('main', 'open', { taskId: 'Молоко' });
    const main = client.region('main');
    const pushes = history.pushes;

    client.close('side');
    await end.flush();

    expect(history.position).toBe(0);
    expect(history.pushes).toBe(pushes);
    expect(urlsOf(history)).toEqual(['/', SIDE_B_URL]);
    expect(client.region('side')).toEqual(EMPTY_REGION);
    expect(client.region('main')).toBe(main);
  });

  test('close(side) при записи без over (панель пришла по ссылке) — замена: назад не идём, URL без _side', async () => {
    const history = new MemoryPageHistory('/earlier');
    history.push(SIDE_B_URL, 'запись по ссылке');
    const { client, end } = await booted(history);
    expect(client.region('side').view?.address).toEqual(CARD_B);

    client.close('side');
    await end.flush();

    expect(history.position).toBe(1);
    expect(history.pushes).toBe(1);
    expect(urlsOf(history)).toEqual(['/earlier', '/']);
    expect(client.region('side')).toEqual(EMPTY_REGION);
  });

  test('ссылка уведомления — новая запись', async () => {
    const { client, history } = await booted();

    await client.openLink(ASSIGNED);

    expect(urlsOf(history)).toEqual(['/', sideUrl('/assigned')]);
    expect(recordAt(history).regions.side?.address).toEqual(ASSIGNED);
  });

  test('выход из экрана в main при depth 0 — новая запись со входом start', async () => {
    const { client, history } = await booted(
      new MemoryPageHistory('/assigned'),
    );

    const outcome = await client.submit('main', 'close', {});

    expect(outcome).toMatchObject({ kind: 'exited', exit: 'closed' });
    expect(urlsOf(history)).toEqual(['/assigned', '/']);
    expect(recordAt(history).regions.main?.address).toEqual(LIST);
    expect(marksAt(history)).toEqual({ depth: 1, over: false });
  });

  test('уход из окна переходом на тот же адрес main — движение назад: записей не прибавилось, окно закрыто; в записи «Вперёд» окно цело', async () => {
    const { client, end, history } = await booted(undefined, CARD_IN_MODAL);
    await client.submit('main', 'open', { taskId: 'Молоко' });
    expect(urlsOf(history)).toEqual(['/', '/']);

    await client.submit('modal', 'back', {});
    await end.flush();

    expect(client.region('modal')).toEqual(EMPTY_REGION);
    expect(urlsOf(history)).toEqual(['/', '/']);
    expect(history.position).toBe(0);
    expect(regionsAt(history, 0)).toEqual(['main']);
    expect(regionsAt(history, 1)).toEqual(['main', 'modal']);
  });

  test('переход из окна на другой экран корня заменяет запись открытия: новой записи нет, over снят', async () => {
    const end = answered()
      .answer('listAssignedTasks', ok([ASSIGNEE_ROW]))
      .answer('getUser', ok({ userId: testUuid(1), active: true }));
    const { client, history } = await booted(undefined, ASSIGNED_IN_MODAL, end);
    await client.openLink(ASSIGNED);
    const pushes = history.pushes;

    await client.submit('modal', 'openAssignee', {});
    await end.flush();

    expect(client.region('main').view?.screen).toBe(USER_CARD_ID);
    expect(client.region('modal')).toEqual(EMPTY_REGION);
    expect(history.entries()).toHaveLength(2);
    expect(history.position).toBe(1);
    expect(history.pushes).toBe(pushes);
    expect(regionsAt(history)).toEqual(['main']);
    expect(marksAt(history)).toEqual({ depth: 1, over: false });
  });

  test('«Повторить» — записей не прибавилось', async () => {
    const { client, history } = await booted();

    await client.retry('main');

    expect(history.entries()).toHaveLength(1);
    expect(history.pushes).toBe(0);
  });

  test('сигнал перечитывания — ревизия растёт, запись не переписывается', async () => {
    const { client, end, history } = await booted();
    await client.local('main', 'toggle', { taskId: 'Хлеб' });
    const replaces = history.replaces;

    await end.deliver(signalOf(watchOf(end, LIST_ID), 'e-1'));

    expect(client.region('main').view?.revision).toBe(2);
    expect(history.replaces).toBe(replaces);
    expect(history.entries()).toHaveLength(1);
  });

  test('исход stayed — записей не прибавилось', async () => {
    const { client, history } = await booted();
    await client.submit('main', 'open', { taskId: 'Молоко' });

    const outcome = await client.submit('side', 'assign', {
      assigneeId: testUuid(2),
    });

    expect(outcome.kind).toBe('stayed');
    expect(history.entries()).toHaveLength(2);
  });

  test('восстановление при attach — ни новых записей, ни замены', async () => {
    const { client, end, history } = await booted();
    await client.local('main', 'toggle', { taskId: 'Хлеб' });
    const replaces = history.replaces;
    const revision = client.region('main').view?.revision ?? 0;
    end.drop();

    await client.attach(nextEnd());

    expect(client.region('main').view?.revision).toBe(revision + 1);
    expect(client.region('main').view?.state).toEqual({ selected: [TASK_A] });
    expect(history.entries()).toHaveLength(1);
    expect(history.replaces).toBe(replaces);
  });

  test('листание: пока цель грузится, записи не пишутся; после готовности — одна замена с новым URL', async () => {
    const { client, end, history } = await booted();
    await client.local('main', 'toggle', { taskId: 'Хлеб' });
    end.hold('listTasks');
    const replaces = history.replaces;

    const going = client.submit('main', 'next', {});
    await end.flush();

    expect(client.region('main').status).toBe('loading');
    expect(history.pushes).toBe(0);
    expect(history.replaces).toBe(replaces);
    expect(recordAt(history).regions.main?.address).toEqual(LIST);
    end.release('listTasks');
    await going;
    expect(history.replaces).toBe(replaces + 1);
    expect(urlsOf(history)).toEqual(['/?page=1']);
    expect(regionsAt(history)).toEqual(['main']);
  });

  test('смена экрана корня: пока цель грузится, текущая запись — только та, что положил шаг; после готовности — одна замена', async () => {
    const { client, end, history } = await booted();
    await client.local('main', 'toggle', { taskId: 'Хлеб' });
    end.hold('listAssignedTasks');
    const replaces = history.replaces;

    const going = client.route('/assigned');
    await end.flush();

    expect(client.region('main').status).toBe('loading');
    expect(history.pushes).toBe(1);
    expect(history.replaces).toBe(replaces);
    expect(recordAt(history).regions).toEqual({});
    end.release('listAssignedTasks');
    await going;
    expect(history.replaces).toBe(replaces + 1);
    expect(regionsAt(history)).toEqual(['main']);
  });

  test('отвергнутая форма и ожидающее подтверждение в запись не попадают: в слоте только адрес, ревизия, состояние', async () => {
    const { client, history } = await booted();
    await client.local('main', 'toggle', { taskId: 'Хлеб' });
    await client.submit('main', 'completeSelected', {});
    await client.submit('main', 'create', { title: '' });
    expect(client.region('main').entered).toBeDefined();

    await client.openLink(ASSIGNED);

    const record = recordAt(history);
    expect(Object.keys(record).sort()).toEqual([
      'depth',
      'over',
      'regions',
      'version',
    ]);
    expect(Object.keys(record.regions.main ?? {}).sort()).toEqual([
      'address',
      'revision',
      'state',
    ]);
    for (const word of ['entered', 'confirm', 'issues', 'note']) {
      expect(history.entries()[1]?.record).not.toContain(word);
    }
  });

  test('ссылка не строится (одиночный суррогат в адресе) — ни новой записи, ни замены; запись прежнего экрана цела', async () => {
    const history = new MemoryPageHistory('/?page=2');
    const faults: UiFault[] = [];
    const client = await rostered(history, faults);
    await client.local('main', 'mark', { filter: 'Ан' });
    const before = history.entries();
    const replaces = history.replaces;

    await client.submit('main', 'find', { query: '\uD800' });

    expect(client.region('main').view?.address.params).toEqual({
      page: 2,
      query: '\uD800',
    });
    expect(client.url()).toBeUndefined();
    expect(history.entries()).toEqual(before);
    expect(history.pushes).toBe(0);
    expect(history.replaces).toBe(replaces);
    expect(recordAt(history).regions.main?.state).toEqual({ filter: 'Ан' });
    expect(faults).toEqual([]);
  });

  test('без порта истории boot отклонён броском сборки', async () => {
    const { client } = tab(answered());

    await expect(client.boot()).rejects.toThrow(
      'PageClient: нет порта истории',
    );
  });
});

describe('PageClient — «Назад» и «Вперёд»', () => {
  test('«Назад» — прежний экран и состояние; «Вперёд» — следующий экран', async () => {
    const { client, history } = await stepped();

    await history.back();

    expect(client.region('main').view?.address).toEqual(LIST);
    expect(client.region('main').view?.state).toEqual({ selected: [TASK_A] });
    await history.forward();
    expect(client.region('main').view?.address).toEqual(ASSIGNED);
    expect(history.entries()).toHaveLength(2);
  });

  test('«Назад» после перехода в экран другого UI-модуля — прежние параметры и состояние; у карточки нет ни выхода, ни «Назад»', async () => {
    const history = new MemoryPageHistory('/?page=2');
    const client = await rostered(history);
    await client.local('main', 'mark', { filter: 'Ан' });

    await client.submit('main', 'open', { personId: 'p-1' });

    expect(client.region('main').view?.screen).toBe(PROFILE_ID);
    expect(client.region('main').view?.actions).toEqual([]);
    expect(ProfileScreenDef.exits).toEqual({});
    expect(urlsOf(history)).toEqual([
      '/?page=2',
      '/cards/profile?personId=p-1',
    ]);
    await history.back();
    expect(client.region('main').view?.screen).toBe(PEOPLE_ID);
    expect(client.region('main').view?.address.params).toEqual({ page: 2 });
    expect(client.region('main').view?.state).toEqual({ filter: 'Ан' });
    await history.forward();
    expect(client.region('main').view?.address).toEqual({
      screen: PROFILE_ID,
      params: { personId: 'p-1' },
    });
  });

  test('«Назад» и «Вперёд» новых записей не кладут; текущая заменена итогом восстановления', async () => {
    const { history } = await stepped();
    const pushes = history.pushes;

    await history.back();
    await history.forward();

    expect(history.pushes).toBe(pushes);
    expect(urlsOf(history)).toEqual(['/', '/assigned']);
    expect(recordAt(history, 0).regions.main?.state).toEqual({
      selected: [TASK_A],
    });
  });

  test('закрыть панель «Назадом» — side пуста, main — тот же объект, список заново не читался', async () => {
    const { client, end, history } = await booted();
    await client.submit('main', 'open', { taskId: 'Молоко' });
    const main = client.region('main');
    const calls = end.names().length;

    await history.back();

    expect(client.region('side')).toEqual(EMPTY_REGION);
    expect(client.region('main')).toBe(main);
    expect(end.names()).toHaveLength(calls);
  });

  test('открыть панель «Вперёдом» — карточка снова в side', async () => {
    const { client, history } = await booted();
    await client.submit('main', 'open', { taskId: 'Молоко' });
    await history.back();

    await history.forward();

    expect(client.region('side').view?.address).toEqual(CARD_B);
    expect(client.url()).toBe(SIDE_B_URL);
  });

  test('«Вперёд» после закрытия панели — карточка снова в side', async () => {
    const { client, end, history } = await booted();
    await client.submit('main', 'open', { taskId: 'Молоко' });
    client.close('side');
    await end.flush();

    await history.forward();

    expect(client.region('side').view?.address).toEqual(CARD_B);
    expect(client.url()).toBe(SIDE_B_URL);
  });

  test('окно в записи: «Вперёд» после закрытия — окно восстановлено; «Назад» — окно закрыто', async () => {
    const { client, end, history } = await booted(undefined, CARD_IN_MODAL);
    await client.submit('main', 'open', { taskId: 'Молоко' });
    client.close('modal');
    await end.flush();
    expect(urlsOf(history)).toEqual(['/', '/']);
    expect(client.region('modal')).toEqual(EMPTY_REGION);

    await history.forward();

    expect(client.region('modal').view?.address).toEqual(CARD_B);
    await history.back();
    expect(client.region('modal')).toEqual(EMPTY_REGION);
  });

  test('два «Назад» подряд без ожидания — итог второй записи; запись промежуточного шага сохранила свой слот main', async () => {
    const { client, history } = await stepped();
    await client.route('/');
    expect(urlsOf(history)).toEqual(['/', '/assigned', '/']);

    await Promise.all([history.back(), history.back()]);

    expect(history.position).toBe(0);
    expect(client.region('main').view?.address).toEqual(LIST);
    expect(client.region('main').view?.state).toEqual({ selected: [TASK_A] });
    expect(recordAt(history, 1).regions.main?.address).toEqual(ASSIGNED);
  });

  test('«Назад» без связи отложен: main в loading с пометкой, вызовов нет; после attach — экран с состоянием из записи', async () => {
    const { client, end, history } = await stepped();
    end.drop();

    const going = history.back();

    expect(await soon(going, end)).toBe('ждёт');
    expect(client.region('main')).toMatchObject({
      status: 'loading',
      address: LIST,
      stale: 'offline',
    });
    expect(end.afterBreak).toEqual([]);
    const next = nextEnd();
    await client.attach(next);
    expect(await soon(going, next)).toBe('разрешён');
    expect(client.region('main')).toMatchObject({ status: 'ready' });
    expect(client.region('main').view?.state).toEqual({ selected: [TASK_A] });
    expect(client.region('main').stale).toBeUndefined();
  });

  test('конец сменился, пока грузится экран записи, — экран перечитан по новому концу: контекст нового hello, состояние из записи', async () => {
    const { history } = await stepped();
    const { codes, release } = holdable();
    const reloaded = history.reloaded();
    const { client } = tab(answered(), codes, undefined, reloaded);

    const going = reloaded.back();
    expect(client.region('main').status).toBe('loading');
    const next = nextEnd({ ...CONTEXT, readOnly: true });
    await client.attach(next);
    release();
    await going;
    await next.flush();

    expect(client.region('main').view?.context).toMatchObject({
      readOnly: true,
    });
    expect(client.region('main').view?.state).toEqual({ selected: [TASK_A] });
    expect(client.region('main').stale).toBeUndefined();
  });

  test('ссылка внутри страницы — шаг: route даёт новую запись, «Назад» возвращает список', async () => {
    const { client, history } = await booted();

    await client.route('/assigned');

    expect(urlsOf(history)).toEqual(['/', '/assigned']);
    await history.back();
    expect(client.region('main').view?.address).toEqual(LIST);
  });

  test('route с портом области вне ссылки не закрывает: side на месте', async () => {
    const { client, history } = await booted();
    await client.submit('main', 'open', { taskId: 'Молоко' });
    const side = client.region('side');

    await client.route('/assigned');

    expect(client.region('side')).toBe(side);
    expect(history.entries()).toHaveLength(3);
  });
});

describe('PageClient — перезагрузка', () => {
  /** Перезагрузка: те же записи истории, новая вкладка на новом конце, `boot()`. */
  const reload = async (
    history: MemoryPageHistory,
    placements?: readonly PagePlacement[],
  ) => booted(history.reloaded(), placements);

  test('три области восстановлены с состоянием; записей столько же, новых нет', async () => {
    const first = await booted(undefined, ASSIGNED_IN_MODAL);
    await first.client.local('main', 'toggle', { taskId: 'Хлеб' });
    await first.client.submit('main', 'open', { taskId: 'Молоко' });
    await first.client.openLink(ASSIGNED);
    expect(first.client.region('modal').view?.screen).toBe(ASSIGNED_ID);

    const second = await reload(first.history, ASSIGNED_IN_MODAL);

    expect(second.client.region('main').view?.state).toEqual({
      selected: [TASK_A],
    });
    expect(second.client.region('side').view?.address).toEqual(CARD_B);
    expect(second.client.region('modal').view?.address).toEqual(ASSIGNED);
    expect(second.history.entries()).toHaveLength(3);
    expect(second.history.pushes).toBe(0);
  });

  test('перезагрузка на промежуточной записи после «Назад» — её области; «Вперёд» после перезагрузки — следующая запись', async () => {
    const first = await stepped();
    await first.client.openLink(CARD_C);
    await first.history.back();

    const second = await reload(first.history);

    expect(second.client.region('main').view?.address).toEqual(ASSIGNED);
    expect(second.client.region('side')).toEqual(EMPTY_REGION);
    await second.history.forward();
    expect(second.client.region('side').view?.address).toEqual(CARD_C);
  });

  test('перезагрузка на записи открытия панели: метки читаются из записи — закрытие панели идёт назад', async () => {
    const first = await booted();
    await first.client.submit('main', 'open', { taskId: 'Молоко' });

    const second = await reload(first.history);
    second.client.close('side');
    await second.end.flush();

    expect(second.history.position).toBe(0);
    expect(second.history.pushes).toBe(0);
    expect(urlsOf(second.history)).toEqual(['/', SIDE_B_URL]);
    expect(second.client.region('side')).toEqual(EMPTY_REGION);
  });

  test('испорченное состояние в записи — список по URL с начальным состоянием; запись заменена исправленной', async () => {
    const history = new MemoryPageHistory(
      '/',
      recordOf({
        main: { address: LIST, revision: 3, state: { selected: 42 } },
      }),
    );

    const { client } = await booted(history);

    expect(client.region('main').view?.state).toEqual({ selected: [] });
    expect(recordAt(history).regions.main?.state).toEqual({ selected: [] });
  });

  test.each([
    [
      '-1',
      recordOf({
        main: { address: LIST, revision: -1, state: { selected: [TASK_A] } },
      }),
    ],
    [
      '1e309',
      `{"version":1,"regions":{"main":{"address":${JSON.stringify(LIST)},"revision":1e309,"state":{"selected":[${JSON.stringify(TASK_A)}]}}}}`,
    ],
  ])(
    'восстановление отказало (ревизия %s) — экран по адресу заново, начальное состояние',
    async (_, record) => {
      const history = new MemoryPageHistory('/', record);

      const { client } = await booted(history);

      expect(client.region('main').view?.address).toEqual(LIST);
      expect(client.region('main').view?.state).toEqual({ selected: [] });
      expect(client.region('main').view?.revision).toBe(1);
    },
  );

  describe('неразборчивая запись — экраны по URL с начальным состоянием, окно не восстановлено', () => {
    const regions = {
      main: { address: LIST, revision: 1, state: { selected: [TASK_A] } },
      side: { address: CARD_LINK, revision: 1 },
      modal: { address: ASSIGNED, revision: 1 },
    };

    test('запись другой версии', async () => {
      const record = JSON.stringify({ version: 2, regions });
      const history = new MemoryPageHistory(SIDE_CARD_URL, record);

      const { client } = await booted(history, ASSIGNED_IN_MODAL);

      expect(client.region('main').view?.address).toEqual(LIST);
      expect(client.region('main').view?.state).toEqual({ selected: [] });
      expect(client.region('side').view?.address).toEqual(CARD_LINK);
      expect(client.region('modal')).toEqual(EMPTY_REGION);
    });
  });

  test('годная запись при той же неразборчивой — окно восстановлено (контроль сцен неразборчивой записи)', async () => {
    const history = new MemoryPageHistory(
      SIDE_CARD_URL,
      recordOf({
        main: { address: LIST, revision: 1, state: { selected: [TASK_A] } },
        modal: { address: ASSIGNED, revision: 1 },
      }),
    );

    const { client } = await booted(history, ASSIGNED_IN_MODAL);

    expect(client.region('main').view?.state).toEqual({ selected: [TASK_A] });
    expect(client.region('modal').view?.address).toEqual(ASSIGNED);
  });

  test('неразборчивый URL при годной записи — вход start с заметкой «Страница не найдена», side и окно пусты', async () => {
    const history = new MemoryPageHistory(
      '/нет',
      recordOf({
        main: { address: LIST, revision: 1, state: { selected: [TASK_A] } },
        side: { address: CARD_LINK, revision: 1 },
        modal: { address: ASSIGNED, revision: 1 },
      }),
    );

    const { client } = await booted(history, ASSIGNED_IN_MODAL);

    expect(client.region('main')).toMatchObject({
      status: 'ready',
      address: LIST,
      note: PAGE_NOTES.notFound,
    });
    expect(client.region('side')).toEqual(EMPTY_REGION);
    expect(client.region('modal')).toEqual(EMPTY_REGION);
  });

  test('URL главнее записи: слот main с другим адресом — открыт адрес URL с начальным состоянием', async () => {
    const history = new MemoryPageHistory(
      '/?page=1',
      recordOf({
        main: { address: LIST, revision: 1, state: { selected: [TASK_A] } },
      }),
    );

    const { client } = await booted(history);

    expect(client.region('main').view?.address.params).toEqual({ page: 1 });
    expect(client.region('main').view?.state).toEqual({ selected: [] });
  });

  test('_side в URL неразборчив — side пуста с заметкой, слот side записи не берётся; main открыт', async () => {
    const history = new MemoryPageHistory(
      `/?_side=${encodeURIComponent('/нет/такого')}`,
      recordOf({
        main: { address: LIST, revision: 1, state: { selected: [TASK_A] } },
        side: { address: CARD_LINK, revision: 1 },
      }),
    );

    const { client } = await booted(history);

    expect(client.region('main').view?.state).toEqual({ selected: [TASK_A] });
    expect(client.region('side')).toEqual({
      ...EMPTY_REGION,
      note: PAGE_NOTES.notFound,
    });
  });

  test('URL главнее записи и для панели: _side с другой карточкой — карточка из URL', async () => {
    const history = new MemoryPageHistory(
      SIDE_B_URL,
      recordOf({
        main: { address: LIST, revision: 1, state: { selected: [] } },
        side: { address: CARD_LINK, revision: 1 },
      }),
    );

    const { client } = await booted(history);

    expect(client.region('side').view?.address).toEqual(CARD_B);
  });

  test('панель вне ссылки — из записи: URL без _side, слот side в записи', async () => {
    const history = new MemoryPageHistory(
      '/',
      recordOf({
        main: { address: LIST, revision: 1, state: { selected: [] } },
        side: { address: CARD_LINK, revision: 1 },
      }),
    );

    const { client } = await booted(history);

    expect(client.region('side').view?.address).toEqual(CARD_LINK);
  });

  test('чужой экран в слоте окна — окно пусто, остальные области целы', async () => {
    const history = new MemoryPageHistory(
      SIDE_CARD_URL,
      recordOf({
        main: { address: LIST, revision: 1, state: { selected: [TASK_A] } },
        side: { address: CARD_LINK, revision: 1 },
        modal: { address: { screen: 'нет/такого', params: {} }, revision: 1 },
      }),
    );

    const { client } = await booted(history);

    expect(client.region('modal')).toEqual(EMPTY_REGION);
    expect(client.region('main').view?.state).toEqual({ selected: [TASK_A] });
    expect(client.region('side').view?.address).toEqual(CARD_LINK);
  });

  test('перезагрузка без связи — области в loading с пометкой, вызовов нет; после attach — восстановлены', async () => {
    const first = await booted();
    await first.client.local('main', 'toggle', { taskId: 'Хлеб' });
    await first.client.submit('main', 'open', { taskId: 'Молоко' });
    const end = answered();
    const { client } = tab(end, undefined, undefined, first.history.reloaded());
    end.drop();

    const booting = client.boot();

    expect(await soon(booting, end)).toBe('ждёт');
    for (const name of ['main', 'side'] as const) {
      expect(client.region(name)).toMatchObject({
        status: 'loading',
        stale: 'offline',
      });
    }
    expect(end.afterBreak).toEqual([]);
    const next = nextEnd();
    await client.attach(next);
    expect(await soon(booting, next)).toBe('разрешён');
    expect(client.region('main').view?.state).toEqual({ selected: [TASK_A] });
    expect(client.region('side').view?.address).toEqual(CARD_B);
  });
});

// Выход экрана при порте истории: цель решает ядро по исходам сторис приложения
// (`ExitTargets`), клиент её исполняет. `back` — в корне при `depth > 0` и
// записи без `over` движение назад по истории (запись предыдущего места
// восстанавливается с перечитыванием), иначе вход `start`; в панели и окне —
// закрытие слоя (движением назад, если запись положило его открытие). `home` —
// вход `start`, `at` — адрес исхода; для слоя они закрывают его, а цель
// открывается в корне.

describe('PageClient — выход сторис и цель', () => {
  test('корень, цель back, depth > 0 — возврат назад: список с выбором из записи, перечитан; записей не прибавилось', async () => {
    const { client, end, history } = await stepped();
    const lists = end.names().filter((name) => name === 'listTasks').length;

    const outcome = await client.submit('main', 'close', {});
    await end.flush();

    expect(outcome).toMatchObject({ kind: 'exited', exit: 'closed' });
    expect(history.position).toBe(0);
    expect(history.pushes).toBe(1);
    expect(urlsOf(history)).toEqual(['/', '/assigned']);
    expect(client.region('main').view?.address).toEqual(LIST);
    expect(client.region('main').view?.state).toEqual({ selected: [TASK_A] });
    expect(end.names().filter((name) => name === 'listTasks')).toHaveLength(
      lists + 1,
    );
  });

  test('корень, цель back, запись открытия слоя — возврата назад нет: вход start', async () => {
    const { client, end, history } = await stepped();
    await client.openLink(CARD_LINK);
    const pushes = history.pushes;

    await client.submit('main', 'close', {});
    await end.flush();

    expect(client.region('main').view?.address).toEqual(LIST);
    expect(history.pushes).toBe(pushes + 1);
    expect(history.position).toBe(pushes + 1);
  });

  test('корень, цель home, depth > 0 — вход start, а не возврат назад', async () => {
    const { client, end, history } = await booted(
      new MemoryPageHistory('/assigned'),
    );
    await client.route('/menu');
    expect(client.region('main').view?.screen).toBe(MENU_ID);

    const outcome = await client.submit('main', 'close', {});
    await end.flush();

    expect(outcome).toMatchObject({ kind: 'exited', exit: 'closed' });
    expect(urlsOf(history)).toEqual(['/assigned', '/menu', '/']);
    expect(history.position).toBe(2);
    expect(client.region('main').view?.address).toEqual(LIST);
  });

  test('корень, цель — адрес, depth 0: создание задачи открывает список с первой страницы', async () => {
    const { client, end, history } = await booted(
      new MemoryPageHistory('/?page=1'),
    );

    const outcome = await client.submit('main', 'create', { title: 'Сыр' });
    await end.flush();

    expect(outcome).toMatchObject({ kind: 'exited', exit: 'created' });
    expect(client.region('main').view?.address).toEqual(LIST);
    expect(urlsOf(history)).toEqual(['/']);
    expect(history.pushes).toBe(0);
  });

  test('корень, цель — адрес, depth > 0: назад не идём, адрес открыт на месте текущей записи', async () => {
    const { client, end, history } = await booted(
      new MemoryPageHistory('/assigned'),
    );
    await client.route('/?page=1');

    await client.submit('main', 'create', { title: 'Сыр' });
    await end.flush();

    expect(client.region('main').view?.address).toEqual(LIST);
    expect(urlsOf(history)).toEqual(['/assigned', '/']);
    expect(history.position).toBe(1);
    expect(history.pushes).toBe(1);
  });

  test('окно, цель home — окно закрыто, вход start открыт в корне; запись открытия заменена', async () => {
    const { client, end, history } = await booted(
      new MemoryPageHistory('/assigned'),
      MENU_IN_MODAL,
    );
    await client.openLink({ screen: MENU_ID, params: {} });
    expect(client.region('modal').view?.screen).toBe(MENU_ID);
    const pushes = history.pushes;

    const outcome = await client.submit('modal', 'close', {});
    await end.flush();

    expect(outcome).toMatchObject({ kind: 'exited', exit: 'closed' });
    expect(client.region('modal').status).toBe('empty');
    expect(client.region('main').view?.address).toEqual(LIST);
    expect(history.pushes).toBe(pushes);
    expect(urlsOf(history)).toEqual(['/assigned', '/']);
    expect(marksAt(history)).toEqual({ depth: 1, over: false });
  });

  test('окно, цель — адрес: адрес открыт в корне, окно закрыто; запись открытия заменена без over', async () => {
    const { client, end, history } = await booted(
      new MemoryPageHistory('/assigned'),
      [{ screen: TaskListScreenDef, region: 'modal' }],
    );
    await client.openLink(LIST);
    expect(client.region('modal').view?.address).toEqual(LIST);
    const pushes = history.pushes;

    const outcome = await client.submit('modal', 'create', { title: 'Сыр' });
    await end.flush();

    expect(outcome).toMatchObject({ kind: 'exited', exit: 'created' });
    expect(client.region('modal').status).toBe('empty');
    expect(client.region('main').view?.address).toEqual(LIST);
    expect(history.pushes).toBe(pushes);
    expect(urlsOf(history)).toEqual(['/assigned', '/']);
    expect(marksAt(history)).toEqual({ depth: 1, over: false });
  });

  test('окно, цель home при корне уже на start: корень не открыт заново, окно закрыто движением назад', async () => {
    const { client, history } = await booted(undefined, MENU_IN_MODAL);
    await client.openLink({ screen: MENU_ID, params: {} });
    const main = client.region('main');

    await client.submit('modal', 'close', {});
    await history.settled();

    expect(client.region('modal').status).toBe('empty');
    expect(client.region('main')).toBe(main);
    expect(history.position).toBe(0);
    expect(history.pushes).toBe(1);
  });
});

describe('PageClient — сбой истории', () => {
  test('порт отказывает — переходы работают, в faults — узел канала и фиксированный текст без URL и без броска порта', async () => {
    const { client, faults, history } = await booted();
    const refusal = new Error('SecurityError: https://school.example/?page=1');
    history.fail(refusal);

    await client.submit('main', 'next', {});

    expect(client.region('main').view?.address.params).toEqual({ page: 1 });
    expect(history.entries()).toHaveLength(1);
    expect(faults.length).toBeGreaterThan(0);
    for (const fault of faults) {
      expect(fault.node).toBe(PAGE_CHANNEL);
      expect(fault.error).not.toBe(refusal);
      expect(fault.error).toEqual(new Error(PAGE_FAULTS.history));
    }
    expect(PAGE_FAULTS.history).toBe('запись истории не принята браузером');
  });

  test('после снятия отказа следующий шаг записан', async () => {
    const { client, history } = await booted();
    history.fail(new Error('SecurityError'));
    await client.submit('main', 'next', {});

    history.fail(undefined);
    await client.openLink(CARD_LINK);

    expect(history.entries()).toHaveLength(2);
    expect(history.current().url).toBe(
      sideUrl(`/todo/taskCard?taskId=${TASK_A}`, '/?page=1'),
    );
  });
});

describe('PageClient — переход по записи и идущие шаги', () => {
  test('«Назад» во время шага на тот же адрес, ещё грузящегося, — новой записи нет, «Вперёд» цел', async () => {
    const { client, end, history } = await stepped();
    const pushes = history.pushes;
    end.hold('listAssignedTasks');

    const going = client.route('/assigned');
    await end.flush();
    const back = history.back();
    await end.flush();
    end.release('listAssignedTasks');
    await Promise.all([going, back]);

    expect(urlsOf(history)).toEqual(['/', '/assigned']);
    expect(history.position).toBe(0);
    expect(history.pushes).toBe(pushes);
  });

  test('«Назад» во время ухода из окна на тот же адрес — новой записи нет, слот окна в записи «Вперёд» цел', async () => {
    const { client, end, history } = await booted(undefined, CARD_IN_MODAL);
    await client.submit('main', 'open', { taskId: 'Молоко' });
    const pushes = history.pushes;
    end.hold('listTasks');

    const leaving = client.submit('modal', 'back', {});
    await end.flush();
    const back = history.back();
    await end.flush();
    end.release('listTasks');
    await Promise.all([leaving, back]);

    expect(history.position).toBe(0);
    expect(history.pushes).toBe(pushes);
    expect(recordAt(history, 1).regions.modal?.address).toEqual(CARD_B);
  });

  test('«Вперёд» к записи с окном, пока окно грузится, — промежуточный снимок (окна ещё нет) в запись не пишется', async () => {
    const end = answered();
    const { client, history } = await booted(undefined, ASSIGNED_IN_MODAL, end);
    await client.submit('main', 'open', { taskId: 'Молоко' });
    await client.openLink(ASSIGNED);
    expect(regionsAt(history, 2)).toEqual(['main', 'modal', 'side']);
    await Promise.all([history.back(), history.back()]);
    end.hold('listAssignedTasks');

    const going = Promise.all([history.forward(), history.forward()]);
    await end.flush();

    expect(history.position).toBe(2);
    expect(regionsAt(history, 2)).toEqual(['main', 'modal', 'side']);
    end.release('listAssignedTasks');
    await going;
    expect(client.region('side').view?.address).toEqual(CARD_B);
    expect(client.region('modal').view?.address).toEqual(ASSIGNED);
    expect(regionsAt(history, 2)).toEqual(['main', 'modal', 'side']);
  });

  test('отказ перехода по записи — в faults как есть; промис «Назад» разрешён, у main заметка', async () => {
    const { codes, broken } = breakable();
    const history = new MemoryPageHistory('/');
    const t = tab(answered(), codes, undefined, history);
    await t.client.boot();
    await t.client.route('/assigned');
    broken.add('taskList');

    await history.back();

    expect(t.faults).toHaveLength(1);
    expect(t.faults[0]?.node).toBe(PAGE_CHANNEL);
    expect(t.faults[0]?.error).toEqual(new Error('код taskList не загрузился'));
    expect(t.client.region('main').note).toBe(PAGE_NOTES.failed);
  });

  test('шаг сразу после начала первой загрузки — своя запись', async () => {
    const end = answered().hold('listTasks');
    const history = new MemoryPageHistory('/');
    const { client } = tab(end, undefined, undefined, history);

    const booting = client.boot();
    const going = client.route('/assigned');
    end.release('listTasks');
    await Promise.all([booting, going]);

    expect(urlsOf(history)).toEqual(['/', '/assigned']);
  });

  test('route на тот же адрес — новой записи нет', async () => {
    const { client, history } = await booted();

    await client.route('/');

    expect(urlsOf(history)).toEqual(['/']);
    expect(history.pushes).toBe(0);
  });

  test('route на тот же адрес во время первой загрузки — новой записи нет', async () => {
    const end = answered().hold('listTasks');
    const history = new MemoryPageHistory('/');
    const { client } = tab(end, undefined, undefined, history);

    const booting = client.boot();
    const going = client.route('/');
    end.release('listTasks');
    await Promise.all([booting, going]);

    expect(urlsOf(history)).toEqual(['/']);
    expect(history.pushes).toBe(0);
  });

  test('неразборчивый URL записи закрывает прочие области: панель пуста, у main заметка', async () => {
    const { client, history } = await booted(new MemoryPageHistory(SIDE_B_URL));
    expect(client.region('side').view?.address).toEqual(CARD_B);
    history.push('/нет', 'чужая');

    await history.back();
    await history.forward();

    expect(client.region('side')).toEqual(EMPTY_REGION);
    expect(client.region('main').note).toBe(PAGE_NOTES.notFound);
  });

  test('после перехода по записи отсев сброшен: чужая запись с тем же состоянием переписана', async () => {
    const { client, end, history } = await booted();
    await client.local('main', 'toggle', { taskId: 'Хлеб' });
    history.push('/', 'чужая');

    await history.back();
    await history.forward();
    await end.deliver(signalOf(watchOf(end, LIST_ID), 'e-1'));

    expect(recordAt(history, 1).regions.main?.state).toEqual({
      selected: [TASK_A],
    });
  });

  test('адрес слота с другим порядком ключей — тот же адрес: состояние из записи', async () => {
    const history = new MemoryPageHistory(
      '/',
      recordOf({
        main: {
          address: { params: { page: 0 }, screen: LIST_ID },
          revision: 1,
          state: { selected: [TASK_A] },
        },
      }),
    );

    const { client } = await booted(history);

    expect(client.region('main').view?.state).toEqual({ selected: [TASK_A] });
  });

  test('пустая область без цели в записи очищается: заметка прежней записи снята', async () => {
    const { client, history } = await booted(
      new MemoryPageHistory(`/?_side=${encodeURIComponent('/нет/такого')}`),
    );
    expect(client.region('side').note).toBe(PAGE_NOTES.notFound);

    await client.route('/assigned');
    await history.back();

    expect(client.region('side')).toEqual(EMPTY_REGION);
  });
});

/**
 * Код экранов, где одна следующая загрузка экрана `name` после `hold()` ждёт
 * `release()`; прочие загрузки — сразу.
 */
const heldOnce = (name: string) => {
  const codes = exampleCodes({}, ExamplePagesUiAppDef);
  const screen = codes.screen.bind(codes);
  let gate: PromiseWithResolvers<void> | undefined;
  codes.screen = async (def) => {
    const held = def.name === name ? gate : undefined;
    if (held !== undefined) {
      gate = undefined;
      await held.promise;
    }
    return screen(def);
  };
  return {
    codes,
    hold: () => {
      gate = Promise.withResolvers<void>();
      return gate;
    },
  };
};

describe('PageClient — переход по записи вытеснен действием', () => {
  test('«Назад» с удержанной загрузкой кода, затем route и локальное действие — запись шага и замены пишутся; поздняя загрузка записей не трогает', async () => {
    const { codes, hold } = heldOnce('assignedTasks');
    const history = new MemoryPageHistory('/assigned');
    const { client, end } = tab(answered(), codes, undefined, history);
    await client.boot();
    await client.route('/');
    const gate = hold();

    const back = history.back();
    await end.flush();
    expect(client.region('main').status).toBe('loading');
    await client.route('/');
    await client.local('main', 'toggle', { taskId: 'Хлеб' });

    expect(urlsOf(history)).toEqual(['/assigned', '/']);
    expect(history.position).toBe(1);
    expect(recordAt(history).regions.main?.state).toEqual({
      selected: [TASK_A],
    });
    const written = history.entries();
    const pushes = history.pushes;
    gate.resolve();
    await back;
    await end.flush();
    expect(history.entries()).toEqual(written);
    expect(history.pushes).toBe(pushes);
    expect(client.region('main').view?.address).toEqual(LIST);
  });

  test('отказ первой загрузки — вызывающему: boot отклонён, main пуста с заметкой, faults пусты', async () => {
    const { codes, broken } = breakable();
    broken.add('taskList');
    const history = new MemoryPageHistory('/');
    const t = tab(answered(), codes, undefined, history);

    await expect(t.client.boot()).rejects.toThrow('код taskList не загрузился');

    expect(t.client.region('main')).toEqual({
      ...EMPTY_REGION,
      note: PAGE_NOTES.failed,
    });
    expect(t.faults).toEqual([]);
  });
});

// Ожидаемый итог действия: жест передаёт вместе с входом функцию — данные
// вида, какими их покажет ответ. Область показывает итог до ответа
// (`expected: true`, «Ждём ответа…» в тексте) и откатывается к виду области,
// как только ответ пришёл или область перестала быть готовой той же ревизии
// того же экземпляра. Пока итог показан, действия этой области недоступны;
// соседняя область не ждёт. История, снимок и URL итога не видят.

const EXPECTING = 'Ждём ответа…';

/** Данные экрана со строками задач: прочие ключи, в том числе поля state строки, остаются как есть. */
const TasksData = v.looseObject({
  tasks: v.array(
    v.looseObject({ uuid: v.string(), title: v.string(), status: v.string() }),
  ),
});

/** Строка задачи карточки — state задачи: итог не теряет его поля. */
const CardData = v.looseObject({
  uuid: v.string(),
  title: v.string(),
  status: v.string(),
});

/** Итог «Выполнить» карточки: задача выполнена. */
const completed = (view: InstanceView) => ({
  ...v.parse(CardData, view.data),
  status: 'done',
});

/** Итог для экрана со строками задач: задача `taskId` выполнена, прочие как были. */
const finished = (taskId: string) => (view: InstanceView) => {
  const data = v.parse(TasksData, view.data);
  return {
    ...data,
    tasks: data.tasks.map((task) =>
      task.uuid === taskId ? { ...task, status: 'done' } : task,
    ),
  };
};

/** Вход вызова UC, как его видит заглушка. */
const CallInput = v.object({
  input: v.object({ taskId: v.string() }),
});

/**
 * Конец со списком задач, который помнит выполненные: `completeTask` с ответом
 * `result` (успех отмечает задачу) — по `release`. Остальные ответы — как у
 * `answered`.
 */
const completing = (result: SerializedResult = ok({})) => {
  const doneIds = new Set<string>();
  return answered()
    .answer('listTasks', () =>
      ok(
        TASKS.map((task) =>
          doneIds.has(task.uuid) ? { ...task, status: 'done' } : task,
        ),
      ),
    )
    .answer('completeTask', (call) => {
      if (result.ok) doneIds.add(v.parse(CallInput, call).input.taskId);
      return result;
    })
    .hold('completeTask');
};

/** Список в `main` и карточка Хлеба в `side`. */
const carded = async (end: StubEnd = completing()) => {
  const t = await listed(end);
  await t.client.submit('main', 'open', { taskId: 'Хлеб' });
  return { ...t, rev: t.client.region('side').view?.revision ?? 0 };
};

const statusOf = (state: PageViewState): unknown =>
  v.parse(CardData, state.view?.data).status;

describe('PageClient — ожидаемый итог действия', () => {
  test('показ до ответа: сразу после жеста — итог и expected; текст области — «Ждём ответа…» и статус итога', async () => {
    const { client, end, text, rev } = await carded();

    const acting = client.submitInput(
      'side',
      'complete',
      undefined,
      rev,
      completed,
    );

    expect(client.region('side').expected).toBe(true);
    expect(statusOf(client.region('side'))).toBe('done');
    expect(text.region('side')).toContain(EXPECTING);
    expect(text.region('side')).toContain('Статус: выполнена');
    await end.flush();
    expect(end.names()).toContain('completeTask');
    expect(client.region('side').expected).toBe(true);
    end.release('completeTask');
    await acting;
  });

  test('успех: stayed; журнал — «открыта», итог с expected, данные сервера новой ревизии без expected; «открыта» между ними нет', async () => {
    const { client, end, rev } = await carded();
    const log = journal(client, 'side');

    const acting = client.submitInput(
      'side',
      'complete',
      undefined,
      rev,
      completed,
    );
    await end.flush();
    end.release('completeTask');
    const outcome = await acting;

    expect(outcome).toEqual({ kind: 'stayed', revision: rev + 1 });
    const seen = log.map((state) => [
      state.view?.revision,
      statusOf(state),
      state.expected,
    ]);
    expect(seen[0]).toEqual([rev, 'open', undefined]);
    expect(seen[1]).toEqual([rev, 'done', true]);
    expect(seen.length).toBeGreaterThan(2);
    for (const entry of seen.slice(2)) {
      expect(entry).toEqual([rev + 1, 'done', undefined]);
    }
    expect(client.region('side').expected).toBeUndefined();
    expect(client.region('side').view?.data).toMatchObject({ status: 'done' });
  });

  test('отказ UC: refused; вид — «открыта» без expected, заметка — текст отказа; итог и заметка отказа вместе не показаны', async () => {
    const { client, end, rev } = await carded(
      completing(err(ErrorDef.serialize(denied))),
    );
    const log = journal(client, 'side');

    const acting = client.submitInput(
      'side',
      'complete',
      undefined,
      rev,
      completed,
    );
    await end.flush();
    end.release('completeTask');
    const outcome = await acting;

    expect(outcome).toMatchObject({ kind: 'refused' });
    expect(client.region('side').expected).toBeUndefined();
    expect(statusOf(client.region('side'))).toBe('open');
    expect(client.region('side').note).toBe(ErrorText.of(denied).summary);
    expect(log.some((state) => state.expected === true)).toBe(true);
    expect(
      log.some(
        (state) =>
          state.expected === true &&
          state.note === ErrorText.of(denied).summary,
      ),
    ).toBe(false);
  });

  test('ревизия устарела к жесту: перечитано сигналом до жеста — stale, итог ни разу не показан, вызова нет', async () => {
    const { client, end, rev } = await carded();
    end.emit(signalOf(watchOf(end, CARD_ID), 'e-1'));
    await end.flush();
    expect(client.region('side').view?.revision).toBe(rev + 1);
    const log = journal(client, 'side');

    const outcome = await client.submitInput(
      'side',
      'complete',
      undefined,
      rev,
      completed,
    );

    expect(outcome).toMatchObject({ kind: 'stale' });
    expect(log.some((state) => state.expected === true)).toBe(false);
    expect(end.names()).not.toContain('completeTask');
  });

  test('перечитывание раньше в очереди: итог показан вместе с refreshing; после ответа чтения — снят, исход stale', async () => {
    const { client, end, rev } = await carded();
    end.hold('listTasks');
    end.emit(signalOf(watchOf(end, CARD_ID), 'e-1'));

    const acting = client.submitInput(
      'side',
      'complete',
      undefined,
      rev,
      completed,
    );

    expect(client.region('side')).toMatchObject({
      expected: true,
      refreshing: true,
    });
    await end.flush();
    end.release('listTasks');
    const outcome = await acting;

    expect(outcome).toMatchObject({ kind: 'stale' });
    expect(client.region('side').expected).toBeUndefined();
    expect(client.region('side').view?.revision).toBe(rev + 1);
    expect(end.names()).not.toContain('completeTask');
  });

  test('сигнал во время ожидания: итог и refreshing вместе; после ответа — ревизия выросла, expected нет', async () => {
    const { client, end, rev } = await carded();
    const acting = client.submitInput(
      'side',
      'complete',
      undefined,
      rev,
      completed,
    );
    await end.flush();

    end.emit(signalOf(watchOf(end, CARD_ID), 'e-1'));

    expect(client.region('side')).toMatchObject({
      expected: true,
      refreshing: true,
    });
    end.release('completeTask');
    await acting;
    await end.flush();
    expect(client.region('side').expected).toBeUndefined();
    expect(client.region('side').refreshing).toBe(false);
    expect(client.region('side').view?.revision).toBeGreaterThan(rev);
    expect(client.region('side').view?.data).toMatchObject({ status: 'done' });
  });

  test('отвергнутый вход: rejected, замечания есть, expected и введённого нет', async () => {
    const { client, rev } = await carded();

    const acting = client.submitInput(
      'side',
      'assign',
      { assigneeId: 'не-uuid' },
      rev,
      completed,
    );
    expect(client.region('side').expected).toBe(true);
    const outcome = await acting;

    expect(outcome).toMatchObject({ kind: 'rejected' });
    expect(client.region('side').issues.length).toBeGreaterThan(0);
    expect(client.region('side').expected).toBeUndefined();
    expect(client.region('side').entered).toBeUndefined();
    expect(statusOf(client.region('side'))).toBe('open');
  });

  test('обрыв во время ожидания: сразу — нет связи без итога; исход refused с заметкой обрыва; после переподключения перечитано без итога', async () => {
    const { client, end, rev } = await carded();
    const acting = client.submitInput(
      'side',
      'complete',
      undefined,
      rev,
      completed,
    );
    await end.flush();
    expect(client.region('side').expected).toBe(true);

    end.drop();

    expect(client.region('side').stale).toBe('offline');
    expect(client.region('side').expected).toBeUndefined();
    expect(statusOf(client.region('side'))).toBe('open');
    const outcome = await acting;
    expect(outcome).toMatchObject({ kind: 'refused' });
    expect(client.region('side').note).toBe(PAGE_NOTES.interrupted);
    expect(client.region('side').expected).toBeUndefined();
    const next = nextEnd();
    await client.attach(next);
    expect(next.names()).toContain('listTasks');
    expect(client.region('side').stale).toBeUndefined();
    expect(client.region('side').expected).toBeUndefined();
    expect(client.region('side').status).toBe('ready');
  });

  test('без связи: unavailable disabled, итог не показан, на провод ничего', async () => {
    const { client, end, rev } = await carded();
    end.drop();
    const log = journal(client, 'side');

    const outcome = await client.submitInput(
      'side',
      'complete',
      undefined,
      rev,
      completed,
    );

    expect(outcome).toEqual({ kind: 'unavailable', reason: 'disabled' });
    expect(log.some((state) => state.expected === true)).toBe(false);
    expect(end.afterBreak).toEqual([]);
  });

  test('уход из области: moved — после исхода в main итога нет, карточка открыта', async () => {
    const { client } = await listed(completing());
    const rev = client.region('main').view?.revision ?? 0;

    const acting = client.submitInput(
      'main',
      'open',
      { taskId: TASK_B },
      rev,
      finished(TASK_B),
    );
    expect(client.region('main').expected).toBe(true);
    const outcome = await acting;

    expect(outcome).toMatchObject({ kind: 'moved' });
    expect(client.region('main').expected).toBeUndefined();
    expect(client.region('main').view?.data).toMatchObject({
      tasks: [{ status: 'open' }, { status: 'open' }],
    });
    expect(client.region('side').view?.address).toEqual(CARD_B);
  });

  test('закрытие во время ожидания: side пуста; после ответа — пуста, исход — вызывающему', async () => {
    const { client, end, rev } = await carded();
    const acting = client.submitInput(
      'side',
      'complete',
      undefined,
      rev,
      completed,
    );
    await end.flush();
    expect(client.region('side').expected).toBe(true);

    client.close('side');

    expect(client.region('side')).toEqual(EMPTY_REGION);
    end.release('completeTask');
    const outcome = await acting;
    expect(outcome.kind).toEqual(expect.any(String));
    expect(client.region('side')).toEqual(EMPTY_REGION);
  });

  test('тот же адрес заново во время ожидания: новый экземпляр той же ревизии — итога нет ни до, ни после ответа', async () => {
    const { client, end, rev } = await carded();
    const acting = client.submitInput(
      'side',
      'complete',
      undefined,
      rev,
      completed,
    );
    await end.flush();
    expect(client.region('side').expected).toBe(true);

    await client.openLink(CARD_LINK);

    expect(client.region('side').view?.address).toEqual(CARD_LINK);
    expect(client.region('side').view?.revision).toBe(rev);
    expect(client.region('side').expected).toBeUndefined();
    expect(statusOf(client.region('side'))).toBe('open');
    end.release('completeTask');
    await acting;
    await end.flush();
    expect(client.region('side').expected).toBeUndefined();
  });

  test('«Назад» во время ожидания: панель закрыта, «Вперёд» вернул карточку — итога нет', async () => {
    const end = completing();
    const { client, history } = await booted(undefined, undefined, end);
    await client.submit('main', 'open', { taskId: 'Хлеб' });
    const rev = client.region('side').view?.revision ?? 0;
    const acting = client.submitInput(
      'side',
      'complete',
      undefined,
      rev,
      completed,
    );
    await end.flush();
    expect(client.region('side').expected).toBe(true);

    await history.back();

    expect(client.region('side').status).toBe('empty');
    await history.forward();
    expect(client.region('side').view?.address).toEqual(CARD_LINK);
    expect(client.region('side').expected).toBeUndefined();
    end.release('completeTask');
    await acting;
    await end.flush();
    expect(client.region('side').expected).toBeUndefined();
  });

  test('история: от постановки до снятия итога записей и замен нет; запись и ссылка — без итога', async () => {
    const end = completing();
    const { client, history } = await booted(undefined, undefined, end);
    await client.submit('main', 'open', { taskId: 'Хлеб' });
    const rev = client.region('side').view?.revision ?? 0;
    const { pushes, replaces } = history;
    const url = client.url();

    const acting = client.submitInput(
      'side',
      'complete',
      undefined,
      rev,
      completed,
    );

    expect(client.region('side').expected).toBe(true);
    expect([history.pushes, history.replaces]).toEqual([pushes, replaces]);
    await end.flush();
    expect(client.region('side').expected).toBe(true);
    expect([history.pushes, history.replaces]).toEqual([pushes, replaces]);
    expect(client.url()).toBe(url);
    expect(JSON.stringify(history.entries())).not.toContain('expected');
    expect(JSON.stringify(client.snapshot())).not.toContain('expected');
    end.release('completeTask');
    await acting;
    expect(history.pushes).toBe(pushes);
    expect(client.url()).toBe(url);
    expect(JSON.stringify(history.entries())).not.toContain('expected');
  });

  test('история после отказанной замены: итог до ответа записей и замен не даёт', async () => {
    const end = completing();
    const { client, history } = await booted(undefined, undefined, end);
    await client.submit('main', 'open', { taskId: 'Хлеб' });
    history.fail(new Error('замена отказана'));
    await client.local('main', 'toggle', { taskId: 'Хлеб' });
    history.fail(undefined);
    const { pushes, replaces } = history;
    const rev = client.region('side').view?.revision ?? 0;

    const acting = client.submitInput(
      'side',
      'complete',
      undefined,
      rev,
      completed,
    );

    expect(client.region('side').expected).toBe(true);
    expect([history.pushes, history.replaces]).toEqual([pushes, replaces]);
    end.release('completeTask');
    await acting;
  });

  test('жест с итогом по виду в отказе: итога нет, сбоев нет', async () => {
    const end = completing().answer(
      'listTasks',
      err(ErrorDef.serialize(denied)),
    );
    const { client, faults } = await listed(end);
    expect(client.region('main').status).toBe('refused');
    const rev = client.region('main').view?.revision ?? 0;

    const acting = client.submitInput(
      'main',
      'completeSelected',
      {},
      rev,
      finished(TASK_A),
    );

    expect(client.region('main').expected).toBeUndefined();
    expect(faults).toEqual([]);
    await acting;
  });

  test('подтверждение: жест с итогом — confirm без итога; «Да» с итогом — итог вместе с прежним подтверждением; после ответа снят', async () => {
    const end = completing().hold('completeTasks');
    const { client } = await listed(end);
    await client.local('main', 'toggle', { taskId: 'Хлеб' });
    const rev = client.region('main').view?.revision ?? 0;
    const all = finished(TASK_A);

    const asked = await client.submitInput(
      'main',
      'completeSelected',
      {},
      rev,
      all,
    );

    expect(asked).toMatchObject({ kind: 'confirm' });
    expect(client.region('main').expected).toBeUndefined();
    const confirm = client.region('main').confirm;
    expect(confirm).toMatchObject({ action: 'completeSelected' });

    const confirming = client.confirm('main', all);

    expect(client.region('main').expected).toBe(true);
    expect(client.region('main').confirm).toEqual(confirm);
    expect(client.region('main').view?.data).toMatchObject({
      tasks: [
        { uuid: TASK_A, status: 'done' },
        { uuid: TASK_B, status: 'open' },
      ],
    });
    await end.flush();
    end.release('completeTasks');
    expect(await confirming).toMatchObject({ kind: 'stayed' });
    expect(client.region('main').expected).toBeUndefined();
    expect(client.region('main').confirm).toBeUndefined();
  });

  test('введённое и замечания при итоге — от области: отвергнутая форма, затем жест с итогом в той же области', async () => {
    const { client } = await listed(completing());
    await client.submit('main', 'create', { title: '' });
    const { entered, issues } = client.region('main');
    expect(entered).toBeDefined();
    const rev = client.region('main').view?.revision ?? 0;

    const acting = client.submitInput(
      'main',
      'open',
      { taskId: TASK_B },
      rev,
      finished(TASK_B),
    );

    expect(client.region('main').expected).toBe(true);
    expect(client.region('main').entered).toEqual(entered);
    expect(client.region('main').issues).toEqual(issues);
    await acting;
  });

  test('итог не по схеме данных экрана: итога нет, в faults — один сбой фиксированным текстом без данных; вызов ушёл', async () => {
    const { client, end, faults, rev } = await carded();
    const weird = (view: InstanceView) => ({
      ...v.parse(CardData, view.data),
      status: 'weird',
    });

    const acting = client.submitInput(
      'side',
      'complete',
      undefined,
      rev,
      weird,
    );

    expect(client.region('side').expected).toBeUndefined();
    expect(statusOf(client.region('side'))).toBe('open');
    await end.flush();
    expect(end.names()).toContain('completeTask');
    end.release('completeTask');
    expect(await acting).toMatchObject({ kind: 'stayed' });
    expect(
      faults.map((fault) => ({
        node: fault.node,
        error: (fault.error as Error).message,
      })),
    ).toEqual([{ node: CARD_ID, error: PAGE_FAULTS.expected }]);
    expect(faults[0]?.error).not.toHaveProperty('cause');
    expect(JSON.stringify(faults)).not.toContain('weird');
    expect(String(faults[0]?.error)).not.toContain('weird');
  });

  test('лишний ключ в итоге отброшен схемой: значения журнала — данные JSON', async () => {
    const { client, end, rev } = await carded();
    const seen: { state: PageViewState; json: string }[] = [];
    client.source('side').subscribe((state) => {
      seen.push({ state, json: JSON.stringify(state) });
    });

    const acting = client.submitInput(
      'side',
      'complete',
      undefined,
      rev,
      (view) => ({ ...completed(view), extra: () => 'функция' }),
    );

    expect(client.region('side').expected).toBe(true);
    expect(client.region('side').view?.data).toEqual({
      ...stateOf(TASK_A, 'Хлеб', 'open'),
      status: 'done',
    });
    await end.flush();
    end.release('completeTask');
    await acting;
    expect(seen.some((s) => s.state.expected === true)).toBe(true);
    for (const { state, json } of seen) {
      expect(JSON.parse(json)).toEqual(state);
      expect(JSON.stringify(state)).toBe(json);
    }
  });

  test('без итога: жест в четыре параметра — итог не показан, вид прежний до ответа', async () => {
    const { client, end, rev } = await carded();
    const before = client.region('side');

    const acting = client.submitInput('side', 'complete', undefined, rev);

    expect(client.region('side')).toBe(before);
    expect(client.region('side').expected).toBeUndefined();
    await end.flush();
    expect(statusOf(client.region('side'))).toBe('open');
    end.release('completeTask');
    expect(await acting).toMatchObject({ kind: 'stayed' });
  });
});

// Локальная доска: строки задач и жест «Выполнить» со входом — какую задачу.
// Учебная сторис такого действия не имеет; итог виден в строке задачи.

const BoardRow = v.object({
  uuid: F.uuid('задачи'),
  title: v.pipe(v.string(), v.description('Название задачи')),
  status: v.pipe(v.picklist(['open', 'done']), v.description('Статус задачи')),
});

const BoardScreenDef = ScreenDef.define({
  name: 'board',
  label: 'Доска',
  description: 'Строки задач с выполнением по одной.',
  reads: [ListTasksUcDef],
  data: v.object({
    tasks: v.pipe(v.array(BoardRow), v.description('Задачи доски')),
  }),
  actions: {
    finish: {
      label: 'Выполнить',
      description: 'Отмечает задачу доски выполненной.',
      input: v.object({ taskId: F.uuid('задачи') }),
      uc: CompleteTaskUcDef,
    },
  },
});

type BoardData = v.InferOutput<typeof BoardScreenDef.data>;

class BoardCode extends ScreenCode<typeof BoardScreenDef> {
  override readonly actions: Partial<ActionSteps<typeof BoardScreenDef>> = {
    finish: {
      command: ({ input }) => ({ taskId: input.taskId }),
      done: () => BoardScreenDef.at({}),
    },
  };

  override async load({
    read,
  }: LoadContext<typeof BoardScreenDef>): Promise<
    Result<BoardData, DomainError>
  > {
    const listed = await read(ListTasksUcDef, {});
    if (!listed.ok) return listed;
    return ok({
      tasks: listed.value.flatMap((task) =>
        task.status === 'open' || task.status === 'done'
          ? [{ uuid: task.uuid, title: task.title, status: task.status }]
          : [],
      ),
    });
  }

  /** Выполнить можно, пока есть открытая задача. */
  override readonly availability = {
    finish: ({ data }: { readonly data: BoardData }) =>
      data.tasks.some((t) => t.status === 'open')
        ? ({ kind: 'available' } as const)
        : ({ kind: 'disabled', text: 'Открытых задач нет' } as const),
  };
}

const BoardUiModuleDef = UiModuleDef.define({
  name: 'tasks',
  label: 'Задачи',
  description: 'Доска задач.',
  screens: [BoardScreenDef],
  stories: [],
});

const BoardSetDef = UiSetDef.define({
  name: 'boardUi',
  label: 'Набор доски',
  description: 'Локальная доска задач с выполнением по одной.',
  app: ExampleAppDef,
  modules: [BoardUiModuleDef],
});

const BoardAppDef = UiAppDef.define({
  name: 'boardPages',
  label: 'Доска на страницах',
  description: 'Приложение страниц доски задач.',
  set: BoardSetDef,
  channel: PAGE_CHANNEL,
  stories: [],
  entries: {
    start: {
      label: 'Доска',
      description: 'Доска задач.',
      address: BoardScreenDef.at({}),
    },
  },
});

/** Вкладка доски: доска в `main`, выполнение задачи — по `release`. */
const boarded = async (end = completing()) => {
  const client = new PageClient({
    app: BoardAppDef,
    codes: AppCodeLoaders.of(BoardAppDef, [
      CodeLoaders.of(BoardUiModuleDef, [
        CodeLoader.screen(BoardScreenDef, async () => new BoardCode()),
      ]),
    ]),
    routes: [],
    end,
    observer: new MemoryUiObserver(),
    clock: new ManualPageClock(),
  });
  await client.route('/tasks/board');
  return { client, end, rev: client.region('main').view?.revision ?? 0 };
};

const rowsOf = (state: PageViewState) =>
  v.parse(TasksData, state.view?.data).tasks.map((task) => task.status);

describe('PageClient — ожидаемый итог на доске', () => {
  test('жест со входом: строка B выполнена до ответа, A и C как были; после ответа — данные сервера', async () => {
    const { client, end, rev } = await boarded();
    expect(rowsOf(client.region('main'))).toEqual(['open', 'open', 'done']);

    const acting = client.submitInput(
      'main',
      'finish',
      { taskId: TASK_B },
      rev,
      finished(TASK_B),
    );

    expect(client.region('main').expected).toBe(true);
    expect(rowsOf(client.region('main'))).toEqual(['open', 'done', 'done']);
    await end.flush();
    end.release('completeTask');
    expect(await acting).toEqual({ kind: 'stayed', revision: rev + 1 });
    expect(client.region('main').expected).toBeUndefined();
    expect(rowsOf(client.region('main'))).toEqual(['open', 'done', 'done']);
    expect(end.calls().find((c) => c.uc === 'completeTask')).toMatchObject({
      input: { taskId: TASK_B },
    });
  });

  test('два действия подряд в одной области: пока итог первого показан, второе недоступно и не уходит; формы действий отключены; после ответа второе проходит', async () => {
    const { client, end, rev } = await boarded();
    const first = client.submitInput(
      'main',
      'finish',
      { taskId: TASK_A },
      rev,
      finished(TASK_A),
    );
    await end.flush();

    const second = client.submitInput(
      'main',
      'finish',
      { taskId: TASK_B },
      rev,
      finished(TASK_B),
    );

    expect(await soon(second, end)).toBe('разрешён');
    expect(await second).toEqual({ kind: 'unavailable', reason: 'disabled' });
    expect(end.names().filter((name) => name === 'completeTask')).toHaveLength(
      1,
    );
    expect(client.region('main').expected).toBe(true);
    expect(rowsOf(client.region('main'))).toEqual(['done', 'open', 'done']);
    const forms = new PageFormModel(BoardSetDef).of(client.region('main'));
    expect(forms.forms.find((form) => form.name === 'finish')?.available).toBe(
      false,
    );
    end.release('completeTask');
    expect(await first).toMatchObject({ kind: 'stayed' });
    expect(client.region('main').expected).toBeUndefined();

    const again = await client.submitInput(
      'main',
      'finish',
      { taskId: TASK_B },
      client.region('main').view?.revision ?? 0,
      finished(TASK_B),
    );

    expect(again).toMatchObject({ kind: 'stayed' });
    expect(rowsOf(client.region('main'))).toEqual(['done', 'done', 'done']);
  });

  test('подтверждение, пока итог области показан, недоступно', async () => {
    const end = completing().hold('completeTasks');
    const { client } = await listed(end);
    await client.local('main', 'toggle', { taskId: 'Хлеб' });
    const rev = client.region('main').view?.revision ?? 0;
    await client.submitInput('main', 'completeSelected', {}, rev);
    const confirming = client.confirm('main', finished(TASK_A));
    await end.flush();

    const twice = client.confirm('main', finished(TASK_A));

    expect(await soon(twice, end)).toBe('разрешён');
    expect(await twice).toEqual({ kind: 'unavailable', reason: 'disabled' });
    expect(client.region('main').note).toBe(PAGE_NOTES.unavailable);
    expect(end.names().filter((name) => name === 'completeTasks')).toHaveLength(
      1,
    );
    end.release('completeTasks');
    await confirming;
  });

  test('форма области, пока итог показан, недоступна: исход сразу, вызова нет, заметка', async () => {
    const { client, end, rev } = await carded();
    const acting = client.submitInput(
      'side',
      'complete',
      undefined,
      rev,
      completed,
    );
    await end.flush();

    const formed = client.submit('side', 'assign', { assigneeId: testUuid(2) });

    expect(await soon(formed, end)).toBe('разрешён');
    expect(await formed).toEqual({ kind: 'unavailable', reason: 'disabled' });
    expect(end.names()).not.toContain('assignTask');
    expect(client.region('side').note).toBe(PAGE_NOTES.unavailable);
    end.release('completeTask');
    await acting;
  });

  test('локальное действие, пока итог показан, не блокируется: ждёт очереди экземпляра и меняет состояние', async () => {
    const end = completing().hold('completeTasks');
    const { client } = await listed(end);
    await client.local('main', 'toggle', { taskId: 'Хлеб' });
    const rev = client.region('main').view?.revision ?? 0;
    await client.submitInput('main', 'completeSelected', {}, rev);
    const confirming = client.confirm('main', finished(TASK_A));
    await end.flush();
    expect(client.region('main').expected).toBe(true);

    const toggled = client.local('main', 'toggle', { taskId: 'Молоко' });

    expect(await soon(toggled, end)).toBe('ждёт');
    end.release('completeTasks');
    await confirming;
    expect(await toggled).toEqual({ kind: 'changed' });
  });
});

describe('PageClient — ожидаемый итог в двух областях', () => {
  /** Список с выбором Хлеба в `main` под вопросом подтверждения и карточка Молока в `side`. */
  const paired = async (end: StubEnd) => {
    const t = await listed(end.hold('completeTasks'));
    await t.client.submit('main', 'open', { taskId: 'Молоко' });
    await t.client.local('main', 'toggle', { taskId: 'Хлеб' });
    const main = t.client.region('main').view?.revision ?? 0;
    await t.client.submitInput('main', 'completeSelected', {}, main);
    return { ...t, side: t.client.region('side').view?.revision ?? 0 };
  };

  test('два действия подряд в разных областях: итоги независимы, соседняя область не ждёт', async () => {
    const { client, end, side } = await paired(completing());

    const listing = client.confirm('main', finished(TASK_A));
    const carding = client.submitInput(
      'side',
      'complete',
      undefined,
      side,
      completed,
    );

    expect(client.region('main').expected).toBe(true);
    expect(client.region('side').expected).toBe(true);
    expect(client.region('main').view?.data).toMatchObject({
      tasks: [
        { uuid: TASK_A, status: 'done' },
        { uuid: TASK_B, status: 'open' },
      ],
    });
    expect(client.region('side').view?.data).toMatchObject({
      uuid: TASK_B,
      status: 'done',
    });
    await end.flush();
    expect(end.names()).toContain('completeTasks');
    expect(end.names()).toContain('completeTask');
    end.release('completeTask');
    expect(await carding).toMatchObject({ kind: 'stayed' });
    expect(client.region('side').expected).toBeUndefined();
    expect(client.region('main').expected).toBe(true);
    end.release('completeTasks');
    expect(await listing).toMatchObject({ kind: 'stayed' });
    expect(client.region('main').expected).toBeUndefined();
  });

  test('отказ карточки — откат только side; итог main держится', async () => {
    const { client, end, side } = await paired(
      completing(err(ErrorDef.serialize(denied))),
    );
    const listing = client.confirm('main', finished(TASK_A));
    const carding = client.submitInput(
      'side',
      'complete',
      undefined,
      side,
      completed,
    );
    await end.flush();

    end.release('completeTask');

    expect(await carding).toMatchObject({ kind: 'refused' });
    expect(client.region('side').expected).toBeUndefined();
    expect(statusOf(client.region('side'))).toBe('open');
    expect(client.region('side').note).toBe(ErrorText.of(denied).summary);
    expect(client.region('main').expected).toBe(true);
    end.release('completeTasks');
    await listing;
  });

  test('отказ первого при живом втором: main без итога с заметкой отказа, side с итогом; затем второе — успех', async () => {
    const end = completing().answer(
      'completeTasks',
      err(ErrorDef.serialize(denied)),
    );
    const { client, side } = await paired(end);
    const listing = client.confirm('main', finished(TASK_A));
    const carding = client.submitInput(
      'side',
      'complete',
      undefined,
      side,
      completed,
    );
    await end.flush();

    end.release('completeTasks');

    expect(await listing).toMatchObject({ kind: 'refused' });
    expect(client.region('main').expected).toBeUndefined();
    expect(client.region('main').note).toBe(ErrorText.of(denied).summary);
    expect(rowsOf(client.region('main'))).toEqual(['open', 'open']);
    expect(client.region('side').expected).toBe(true);
    expect(statusOf(client.region('side'))).toBe('done');
    end.release('completeTask');
    expect(await carding).toMatchObject({ kind: 'stayed' });
    expect(client.region('side').expected).toBeUndefined();
    expect(statusOf(client.region('side'))).toBe('done');
  });
});

describe('PageClient — отрезанная ветка приложения', () => {
  /** Страничное приложение без сторис карточки пользователя. */
  const TrimmedPagesAppDef = UiAppDef.define({
    name: 'trimmedPages',
    label: 'Урезанное приложение',
    description: 'Страницы без просмотра карточки пользователя.',
    set: ExampleUiSetDef,
    channel: PAGE_CHANNEL,
    stories: [
      StartWorkStoryDef,
      PlanTasksStoryDef,
      FinishTasksStoryDef,
      FollowAssignedStoryDef,
    ],
    entries: ExamplePagesUiAppDef.entries,
  });
  const ROW = {
    ...stateOf(TASK_A, 'Хлеб', 'open'),
    ownerId: testUuid(9),
    assignment: { assigneeId: SUBJECT_ID, assignedAt: AT },
  };
  const client = async () => {
    let requests = 0;
    const page = new PageClient({
      app: TrimmedPagesAppDef,
      codes: exampleCodes({}, TrimmedPagesAppDef),
      routes: examplePagesRoutes,
      end: new StubEnd().answer('listAssignedTasks', ok([ROW])),
      observer: new MemoryUiObserver(),
      clock: new ManualPageClock(),
      reviveSubject,
      requestIds: () => {
        requests += 1;
        return `r-${requests}`;
      },
    });
    await page.route('/assigned');
    return page;
  };

  test('у «Назначенные мне» нет действия карточки исполнителя', async () => {
    const actions = (await client()).region('main').view?.actions;
    const names = actions?.map((action) => action.name);

    expect(names).toEqual(['completeSelected', 'close']);
  });

  test('сигнал по отрезанному действию — unavailable/unknown', async () => {
    const outcome = await (await client()).submit('main', 'openAssignee', {});

    expect(outcome).toEqual({ kind: 'unavailable', reason: 'unknown' });
  });
});

// Причина отключённого действия — в форме области: вид решает, форма области
// несёт текст отказа как `reason`; доступное действие причины не имеет.

const forms = (client: PageClient, set: AnyUiSetDef = ExampleUiSetDef) =>
  new PageFormModel(set).of(client.region('main')).forms;

const formOn = (
  client: PageClient,
  name: string,
  set: AnyUiSetDef = ExampleUiSetDef,
) => {
  const form = forms(client, set).find((candidate) => candidate.name === name);
  if (form === undefined) throw new Error(`нет формы ${name}`);
  return form;
};

describe('PageClient — причина отключённого действия в форме', () => {
  test('основание «своё условие экрана»: все задачи доски выполнены — форма available false, reason — текст кода', async () => {
    const done = TASKS.map((task) => ({ ...task, status: 'done' }));
    const { client } = await boarded(
      new StubEnd().answer('listTasks', ok(done)),
    );

    expect(formOn(client, 'finish', BoardSetDef)).toMatchObject({
      available: false,
      reason: 'Открытых задач нет',
    });
  });
});
