import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { type DomainError, ok, type Result, Trace, UserCaller } from 'dmg-core';
import {
  AwaitingBus,
  MemoryLogger,
  testTrace,
  testUuid,
  useTempDir,
} from 'dmg-core/testing';
import {
  AssignTaskUcDef,
  CreateTaskUcDef,
  ExampleApp,
  type ExampleUser,
  ListAssignedTasksUcDef,
  ListTasksUcDef,
  TodoModuleDef,
} from 'dmg-core/testing/example';
import {
  type ActionSteps,
  type DataOf,
  type LoadContext,
  ScreenCode,
  type StateOf,
} from 'dmg-ui';
import {
  Conversations,
  MemoryConversationStore,
  PlainText,
} from 'dmg-ui/chat-ui';
import {
  ExampleDialogAppDef,
  exampleDialogViews,
  MemoryMessenger,
} from 'dmg-ui/chat-ui/testing';
import {
  ApiAppDispatch,
  type PersonPlaces,
  type RecipientCallers,
  type UcDispatch,
  UiServer,
} from 'dmg-ui/server';
import {
  AssignedTasksScreenDef,
  ExampleUiSetDef,
  exampleCodes,
  MemoryUiObserver,
} from 'dmg-ui/testing';
import { T0 } from 'dmg-ui/testing/fixtures';
import { PageClient, PageFormModel, PageHost, PageWire } from 'dmg-ui/web-ui';
import {
  ExamplePagesAppDef,
  examplePageRoutes,
  exampleSubjectWire,
} from 'dmg-ui/web-ui/testing';

// Приёмка доступности на беседе и на странице: один код экранов и один сервер,
// три человека — владелец `A`, исполнитель `B` и администратор `C` (подставной
// `callers` поверх `example.callers`). Вид решает доступность по субъекту и
// данным, сервер перепроверяет каждый вызов: ложное «доступно» отказывает сам UC.

const A = testUuid(1);
const B = testUuid(2);
const C = testUuid(3);
type Who = { readonly peer: string; readonly sender: string };
const WHO: Readonly<Record<string, Who>> = {
  [A]: { peer: 'peer-a', sender: 'sender-a' },
  [B]: { peer: 'peer-b', sender: 'sender-b' },
  [C]: { peer: 'peer-c', sender: 'sender-c' },
};

/** Собеседник по `uuid`; неизвестный — ошибка сцены. */
const whoOf = (uuid: string): Who => {
  const who = WHO[uuid];
  if (who === undefined) throw new Error(`нет собеседника ${uuid}`);
  return who;
};
const places: PersonPlaces = {
  place: async () => ({ locale: 'ru-RU', timeZone: 'Asia/Oral' }),
};
const tmp = useTempDir('dmg-ui-channels-availability-');

const COMPLETE_ALL = 'Выполнить выбранные';
const TOGGLE = 'Отметить задачу';
const LIMIT_TEXT = 'Слишком много открытых задач';

/** Субъект с ролью администратора: подставной `callers` выдаёт его тем, кто в `administrators`. */
const administrator = (uuid: string): ExampleUser => ({
  uuid,
  hasRole: (role) => role === 'admin',
});

/** Приложение, сервер с счётчиком вызовов UC и беседы трёх людей на одном мессенджере. */
const worldOf = (name: string, codes = exampleCodes()) => {
  const bus = new AwaitingBus();
  const context = { bus, logger: new MemoryLogger() };
  const example = new ExampleApp(
    { mode: 'test', dataDir: join(tmp().path, name), users: [A, B, C] },
    { ...context, clock: () => T0 },
  );
  const inner = new ApiAppDispatch(example.api);
  const calls: string[] = [];
  const dispatch: UcDispatch<ExampleUser> = {
    dispatch: async (request) => {
      calls.push(request.uc.name);
      return inner.dispatch(request);
    },
  };
  const administrators = new Set<string>([C]);
  const callers: RecipientCallers<ExampleUser> = {
    resolve: async (uuid, trace) =>
      administrators.has(uuid)
        ? ok(new UserCaller(administrator(uuid)))
        : example.callers.resolve(uuid, trace),
  };
  const observer = new MemoryUiObserver();
  const messenger = MemoryMessenger.editing();
  const server = new UiServer({ set: ExampleUiSetDef, dispatch, context });
  let requests = 0;
  const conversations = new Conversations({
    app: ExampleDialogAppDef,
    codes,
    server,
    views: exampleDialogViews,
    observer,
    messenger,
    store: new MemoryConversationStore(),
    logger: context.logger,
    people: async (sender) =>
      Object.entries(WHO).find(([, who]) => who.sender === sender)?.[0],
    peers: async (uuid) => WHO[uuid]?.peer,
    callers,
    places,
    requestIds: () => {
      requests += 1;
      return `r-${requests}`;
    },
  });
  return {
    bus,
    context,
    example,
    server,
    callers,
    calls,
    administrators,
    observer,
    messenger,
    conversations,
  };
};

type World = ReturnType<typeof worldOf>;

/** Человек беседы: что видит и что нажимает. */
const personOf = (w: World, uuid: string) => {
  const who = whoOf(uuid);
  let ids = 0;
  const head = () => {
    ids += 1;
    return { id: `s-${uuid}-${ids}`, ...who };
  };
  const live = () =>
    [...w.messenger.chat(who.peer)]
      .reverse()
      .find((line) => !line.retired && line.message.options.length > 0);
  const labels = () => live()?.message.options.map((o) => o.label) ?? [];
  const settle = async () => {
    await w.bus.delivered();
    await w.conversations.settled();
  };
  const press = async (label: string) => {
    const option = live()?.message.options.find((o) => o.label === label);
    if (option === undefined) throw new Error(`нет варианта «${label}»`);
    await w.conversations.receive({
      ...head(),
      kind: 'press',
      ref: option.ref,
      press: `p-${ids}`,
    });
  };
  return {
    labels,
    enter: (entry: string) =>
      w.conversations.receive({ ...head(), kind: 'enter', entry }),
    say: (text: string) =>
      w.conversations.receive({ ...head(), kind: 'text', text }),
    press,
    /** Подтверждение «Да», если экран его потребовал. */
    confirm: async () => {
      const yes = live()?.message.options.find((o) => o.label === 'Да');
      if (yes === undefined) return;
      await w.conversations.receive({
        ...head(),
        kind: 'press',
        ref: yes.ref,
        press: `p-${ids}`,
      });
    },
    settle,
    /** «Отметить задачу» и выбор задачи `title` вариантом поля. */
    select: async (title: string) => {
      await press(TOGGLE);
      await press(title);
    },
    /** Текст последнего сообщения беседы. */
    text: () => {
      const message = w.messenger.chat(who.peer).at(-1)?.message;
      return message === undefined ? '' : PlainText.of(message.text);
    },
  };
};

/** Операция приложения от имени `uuid` (учебный резолвер: роли у него нет). */
const asUser = async (w: World, uuid: string, requestId: string) => {
  const trace = Trace.fromRequest({ requestId });
  const caller = await w.example.callers.resolve(uuid, trace);
  if (!caller.ok) throw new Error(`вызывающий ${uuid} не найден`);
  return { caller: caller.value, trace };
};

const createTask = async (w: World, owner: string, title: string) => {
  const at = await asUser(w, owner, `r-create-${title}`);
  const created = await w.example.api.dispatch(
    TodoModuleDef,
    CreateTaskUcDef.command({ title }),
    at.caller,
    at.trace,
  );
  if (!created.ok) throw new Error('createTask: отказ');
  return created.value.taskId;
};

const assignTask = async (w: World, taskId: string, assigneeId: string) => {
  const at = await asUser(w, A, `r-assign-${taskId}-${assigneeId}`);
  const assigned = await w.example.api.dispatch(
    TodoModuleDef,
    AssignTaskUcDef.command({ taskId, assigneeId }),
    at.caller,
    at.trace,
  );
  if (!assigned.ok) throw new Error('assignTask: отказ');
  await w.bus.delivered();
};

/** Владелец `A` создал «Хлеб» и поручил его `B`, «Молоко» — `C`. */
const assignedToBAndC = async (w: World) => {
  await assignTask(w, await createTask(w, A, 'Хлеб'), B);
  await assignTask(w, await createTask(w, A, 'Молоко'), C);
};

/** Задачи владельца `A`: название и статус. */
const tasksOfA = async (w: World) => {
  const at = await asUser(w, A, 'r-list');
  const listed = await w.example.api.dispatch(
    TodoModuleDef,
    ListTasksUcDef.command({}),
    at.caller,
    testTrace(),
  );
  if (!listed.ok) throw new Error('listTasks: отказ');
  return listed.value.map((t) => ({ title: t.title, status: t.status }));
};

describe('приёмка доступности: беседа', () => {
  test('выделение: «Выполнить выбранные» появляется после «Отметить задачу», UC при выделении не вызывается', async () => {
    const w = worldOf('select');
    await createTask(w, A, 'Хлеб');
    const a = personOf(w, A);
    await a.enter('start');
    const before = w.calls.length;
    const hidden = a.labels();

    await a.press(TOGGLE);
    await a.press('Хлеб');

    expect(hidden).not.toContain(COMPLETE_ALL);
    expect(a.labels()).toContain(COMPLETE_ALL);
    expect(w.calls).toHaveLength(before);
  });

  test('роль и право: исполнитель-не-владелец выбрал поручение — «Выполнить выбранные» нет', async () => {
    const w = worldOf('roles-b');
    await assignedToBAndC(w);
    const b = personOf(w, B);

    await b.enter('assigned');
    await b.select('Хлеб');

    expect(b.labels()).not.toContain(COMPLETE_ALL);
  });

  test('роль и право: администратор выбрал поручение — «Выполнить выбранные» есть, выполнение проходит', async () => {
    const w = worldOf('roles-c');
    await assignedToBAndC(w);
    const c = personOf(w, C);

    await c.enter('assigned');
    await c.select('Молоко');
    await c.press(COMPLETE_ALL);
    await c.confirm();
    await c.settle();

    expect(await tasksOfA(w)).toEqual([
      { title: 'Хлеб', status: 'open' },
      { title: 'Молоко', status: 'done' },
    ]);
  });

  test('смена роли между показами: следующий показ с новым ответом', async () => {
    const w = worldOf('role-change');
    await assignedToBAndC(w);
    const b = personOf(w, B);
    await b.enter('assigned');
    await b.select('Хлеб');
    const before = b.labels();

    w.administrators.add(B);
    await b.enter('assigned');
    await b.select('Хлеб');

    expect(before).not.toContain(COMPLETE_ALL);
    expect(b.labels()).toContain(COMPLETE_ALL);
  });

  test('предел открытых: у владельца трёх открытых «Создать задачу» нет, свободный текст отвечает причиной, задач по-прежнему три', async () => {
    const w = worldOf('limit');
    for (const title of ['Хлеб', 'Молоко', 'Сыр']) {
      await createTask(w, A, title);
    }
    const a = personOf(w, A);
    await a.enter('start');

    await a.say('Яйца');

    expect(a.labels()).not.toContain('Создать задачу');
    expect(a.text()).toContain(LIMIT_TEXT);
    expect(a.text()).not.toContain('Выберите вариант');
    expect(w.calls).not.toContain('createTask');
    expect(await tasksOfA(w)).toHaveLength(3);
  });

  test('две открытые: «Создать задачу» есть, текст запускает создание', async () => {
    const w = worldOf('two');
    for (const title of ['Хлеб', 'Молоко']) await createTask(w, A, title);
    const a = personOf(w, A);
    await a.enter('start');

    expect(a.labels()).toContain('Создать задачу');
    await a.say('Сыр');
    await a.settle();

    expect(await tasksOfA(w)).toHaveLength(3);
  });
});

// Код «Назначенные мне» с ложной доступностью: показывает «Выполнить
// выбранные» всем. Сервер всё равно проверяет Policy самого UC.

type Assigned = typeof AssignedTasksScreenDef;

class LiarAssignedCode extends ScreenCode<Assigned> {
  override readonly locals = {
    toggle: (
      state: StateOf<Assigned>,
      _data: DataOf<Assigned>,
      input: { taskId: string },
    ): StateOf<Assigned> => ({
      selected: state.selected.includes(input.taskId)
        ? state.selected.filter((id) => id !== input.taskId)
        : [...state.selected, input.taskId],
    }),
  };

  override readonly actions: Partial<ActionSteps<Assigned>> = {
    completeSelected: {
      command: ({ state }) => ({ taskIds: state.selected }),
      done: () => AssignedTasksScreenDef.at({}),
    },
    openAssignee: { done: () => AssignedTasksScreenDef.at({}) },
    close: { done: () => AssignedTasksScreenDef.exits.closed.with() },
  };

  override async load({
    read,
  }: LoadContext<Assigned>): Promise<Result<DataOf<Assigned>, DomainError>> {
    const listed = await read(ListAssignedTasksUcDef, {});
    if (!listed.ok) return listed;
    return ok({ tasks: [...listed.value] });
  }

  override initialState(): StateOf<Assigned> {
    return { selected: [] };
  }

  override choices(_name: string, data: DataOf<Assigned>) {
    return {
      taskId: data.tasks.map((task) => ({
        value: task.uuid,
        label: task.title,
      })),
    };
  }
}

describe('приёмка доступности: сервер перепроверяет', () => {
  test('ложное «доступно»: исполнитель нажимает «Выполнить выбранные» — ACCESS_DENIED с denyMessage, статусы прежние', async () => {
    const w = worldOf(
      'liar',
      exampleCodes({ assigned: new LiarAssignedCode() }),
    );
    const task = await createTask(w, A, 'Хлеб');
    await assignTask(w, task, B);
    const b = personOf(w, B);
    await b.enter('assigned');
    await b.press(TOGGLE);
    await b.press('Хлеб');
    expect(b.labels()).toContain(COMPLETE_ALL);

    await b.press(COMPLETE_ALL);
    await b.confirm();
    await b.settle();

    expect(w.observer.records).toContainEqual(
      expect.objectContaining({ kind: 'refused', code: 'ACCESS_DENIED' }),
    );
    expect(JSON.stringify(w.messenger.journal)).toContain(
      'Управлять набором задач может владелец каждой из них или администратор.',
    );
    expect(await tasksOfA(w)).toEqual([{ title: 'Хлеб', status: 'open' }]);
  });
});

// Страница: тот же мир и те же трое людей; вкладка — клиент на проводе в
// памяти. Доступность видна как форма области: `available` и причина `reason`.

const TOKENS: Readonly<Record<string, string>> = { tA: A, tB: B, tC: C };

/** Хост страниц мира и вкладки людей; id запросов — одна последовательность на мир. */
const pagesOf = (w: World, codes = exampleCodes()) => {
  const host = new PageHost({
    app: ExamplePagesAppDef,
    server: w.server,
    tokens: async (token) => TOKENS[token],
    callers: w.callers,
    places,
    logger: w.context.logger,
    subjectToWire: exampleSubjectWire.toWire,
  });
  let requests = 0;
  return {
    host,
    /** Новое соединение человека по пропуску и клиент вкладки на нём. */
    tab: async (token: string) => {
      const wire = new PageWire(host);
      const connected = await wire.connect(token);
      if (!connected.ok) throw new Error(`connect(${token}): отказ`);
      const client = new PageClient({
        app: ExamplePagesAppDef,
        codes,
        routes: examplePageRoutes,
        end: connected.value,
        observer: w.observer,
        reviveSubject: exampleSubjectWire.revive,
        requestIds: () => {
          requests += 1;
          return `p-${requests}`;
        },
      });
      return { wire, client };
    },
  };
};

type Tab = Awaited<ReturnType<ReturnType<typeof pagesOf>['tab']>>;

/** Формы основной области вкладки. */
const formsOf = (tab: Tab) =>
  new PageFormModel(ExampleUiSetDef).of(tab.client.region('main')).forms;

const formOf = (tab: Tab, name: string) =>
  formsOf(tab).find((form) => form.name === name);

/** Прямой вызов UC по проводу страницы, минуя клиент: сообщения сервера в ответ. */
const directCall = async (
  host: PageHost<ExampleUser>,
  token: string,
  call: { readonly uc: string; readonly input: unknown },
) => {
  const wire = new PageWire(host);
  const connected = await wire.connect(token);
  if (!connected.ok) throw new Error(`connect(${token}): отказ`);
  const received: unknown[] = [];
  connected.value.onMessage((message) => {
    received.push(message);
  });
  connected.value.send({
    kind: 'call',
    id: 'c1',
    call: { module: 'todo', requestId: 'r-direct', ...call },
  });
  await wire.settled();
  return received;
};

describe('приёмка доступности: страница', () => {
  test('выделение: форма «Выполнить выбранные» — available false с причиной до выделения, true после, UC не вызывается', async () => {
    const w = worldOf('page-select');
    await createTask(w, A, 'Хлеб');
    const a = await pagesOf(w).tab('tA');
    await a.client.route('/');
    const before = w.calls.length;
    const off = formOf(a, 'completeSelected');

    await a.client.local('main', 'toggle', { taskId: 'Хлеб' });

    expect(off?.available).toBe(false);
    expect(formOf(a, 'completeSelected')?.available).toBe(true);
    expect(formOf(a, 'completeSelected')).not.toHaveProperty('reason');
    expect(w.calls).toHaveLength(before);
    expect(off?.reason).toBe('Отметьте открытые задачи');
  });

  test('роль и право: исполнитель-не-владелец выбрал поручение — формы выполнения нет', async () => {
    const w = worldOf('page-roles-b');
    await assignedToBAndC(w);
    const b = await pagesOf(w).tab('tB');
    await b.client.route('/assigned');

    await b.client.local('main', 'toggle', { taskId: 'Хлеб' });

    expect(formOf(b, 'completeSelected')).toBeUndefined();
  });

  test('роль и право: администратор выбрал поручение — форма доступна, выполнение проходит', async () => {
    const w = worldOf('page-roles-c');
    await assignedToBAndC(w);
    const c = await pagesOf(w).tab('tC');
    await c.client.route('/assigned');

    await c.client.local('main', 'toggle', { taskId: 'Молоко' });
    const selected = formOf(c, 'completeSelected');
    const asked = await c.client.submit('main', 'completeSelected', {});
    const done = await c.client.confirm('main');
    await w.bus.delivered();
    await c.wire.settled();

    expect(selected?.available).toBe(true);
    expect(asked).toMatchObject({ kind: 'confirm' });
    expect(done).toMatchObject({ kind: 'stayed' });
    expect(await tasksOfA(w)).toEqual([
      { title: 'Хлеб', status: 'open' },
      { title: 'Молоко', status: 'done' },
    ]);
  });

  test('предел открытых: у владельца трёх открытых форма «Создать» — available false с причиной, отправка — unavailable disabled, UC не вызван', async () => {
    const w = worldOf('page-limit');
    for (const title of ['Хлеб', 'Молоко', 'Сыр']) {
      await createTask(w, A, title);
    }
    const a = await pagesOf(w).tab('tA');
    await a.client.route('/');

    const outcome = await a.client.submit('main', 'create', { title: 'Яйца' });

    expect(formOf(a, 'create')?.available).toBe(false);
    expect(outcome).toEqual({ kind: 'unavailable', reason: 'disabled' });
    expect(w.calls).not.toContain('createTask');
    expect(await tasksOfA(w)).toHaveLength(3);
    expect(formOf(a, 'create')?.reason).toBe(LIMIT_TEXT);
  });

  test('ложное «доступно»: прямой call completeTasks через провод страницы от исполнителя — ACCESS_DENIED, статусы прежние', async () => {
    const w = worldOf('page-direct');
    const task = await createTask(w, A, 'Хлеб');
    await assignTask(w, task, B);

    const received = await directCall(pagesOf(w).host, 'tB', {
      uc: 'completeTasks',
      input: { taskIds: [task] },
    });

    expect(received).toContainEqual({
      kind: 'result',
      id: 'c1',
      result: expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ code: 'ACCESS_DENIED' }),
      }),
    });
    expect(await tasksOfA(w)).toEqual([{ title: 'Хлеб', status: 'open' }]);
  });

  test('смена роли: новое соединение исполнителя, ставшего администратором, — форма выполнения доступна', async () => {
    const w = worldOf('page-role-change');
    await assignedToBAndC(w);
    const pages = pagesOf(w);
    const before = await pages.tab('tB');
    await before.client.route('/assigned');
    await before.client.local('main', 'toggle', { taskId: 'Хлеб' });

    w.administrators.add(B);
    const after = await pages.tab('tB');
    await after.client.route('/assigned');
    await after.client.local('main', 'toggle', { taskId: 'Хлеб' });

    expect(formOf(before, 'completeSelected')).toBeUndefined();
    expect(formOf(after, 'completeSelected')?.available).toBe(true);
  });
});
