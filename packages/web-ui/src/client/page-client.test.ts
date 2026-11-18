import { describe, expect, test } from 'bun:test';
import {
  CoreErrors,
  ErrorDef,
  ErrorText,
  err,
  ok,
  type SerializedResult,
} from 'dmg-core';
import { testUuid } from 'dmg-core/testing';
import { TaskEvents } from 'dmg-core/testing/example';
import type { UiFault } from 'dmg-ui';
import {
  ASSIGNED_ID,
  AssignedTasksScreenDef,
  CARD_ID,
  exampleCodes,
  LIST_ID,
  MemoryUiObserver,
  TASK_A,
  TASK_B,
  TaskCardScreenDef,
  TaskListScreenDef,
} from 'dmg-ui/testing';
import {
  ExamplePagesAppDef,
  examplePageRoutes,
  examplePageViews,
} from '../../testing';
import { PAGE_CHANNEL } from '../page-channel.const';
import type { PageViewState } from '../view/page-view-state.types';
import type {
  ClientMessage as ClientMsg,
  ServerMessage as ServerMsg,
} from '../wire/page-messages.types';
import type { ClientEnd } from '../wire/page-wire.types';
import { PageClient } from './page-client';
import { PAGE_DEFECTS, PAGE_NOTES } from './page-client.const';
import type { PageRegionName } from './page-client.types';
import { PageText } from './page-text';

// Клиентская половина страничного канала: две области (`main`, `side`),
// политики исходов, входящие, снимок, состояния области. Сервер — заглушка
// конца провода: отвечает на `call` по имени UC и умеет сам прислать
// сообщение. Ответы — микрозадачи, `flush()` отдаёт их без таймеров
// (TST-04); удержанный UC отвечает по `release`. Текст страницы — у
// `PageText`, состояния — журнал `source(region).subscribe`.

const TASK_C = testUuid(3);
const TASKS = [
  { uuid: TASK_A, title: 'Хлеб', status: 'open' },
  { uuid: TASK_B, title: 'Молоко', status: 'open' },
  { uuid: TASK_C, title: 'Сыр', status: 'open' },
];
const LIST = { screen: LIST_ID, params: { page: 0 } };
const ASSIGNED = { screen: ASSIGNED_ID, params: {} };
const CONTEXT = {
  locale: 'ru-RU',
  timeZone: 'Asia/Oral',
  delegate: false,
  readOnly: false,
};

type Answer = SerializedResult | ((call: unknown) => SerializedResult);

/** Конец провода клиента: журнал отправленного, ответы по имени UC, сообщения сервера. */
class StubEnd implements ClientEnd {
  readonly sent: ClientMsg[] = [];
  private readonly handlers: ((message: ServerMsg) => Promise<void> | void)[] =
    [];
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

  onBreak(): void {}

  send(message: ClientMsg): void {
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

  close(): void {}

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
  codes = exampleCodes(),
) => {
  let requests = 0;
  const observer = new MemoryUiObserver();
  const faults: UiFault[] = [];
  const client = new PageClient({
    app: ExamplePagesAppDef,
    codes,
    views: examplePageViews,
    routes: examplePageRoutes,
    end,
    observer,
    faults: (fault) => {
      faults.push(fault);
    },
    requestIds: () => {
      requests += 1;
      return `r-${requests}`;
    },
  });
  const text = new PageText(client, examplePageViews);
  return { client, end, observer, faults, text };
};

/** Вкладка со списком в `main`. */
const listed = async (end?: StubEnd) => {
  const t = tab(end);
  await t.client.route('/');
  return t;
};

/** Код экранов, загрузку которого можно сломать: `broken` — экран `id` не грузится. */
const breakable = () => {
  const codes = exampleCodes();
  const screen = codes.screen.bind(codes);
  const broken = new Set<string>();
  codes.screen = (def) =>
    broken.has(def.name)
      ? Promise.reject(new Error(`код ${def.name} не загрузился`))
      : screen(def);
  return { codes, broken };
};

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

  test('неизвестный маршрут — заметка в main, ничего не открыто и не отправлено', async () => {
    const { client, end } = tab();

    await client.route('/нет');

    expect(client.region('main').note).toBe('Страница не найдена');
    expect(client.region('main').view).toBeUndefined();
    expect(end.sent).toEqual([]);
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

  test('rejected — замечания по полям в области, вызов не ушёл; следующий вход их снимает', async () => {
    const end = new StubEnd()
      .answer('listTasks', ok(TASKS))
      .answer('createTask', ok({ taskId: TASK_A }));
    const { client } = await listed(end);

    const outcome = await client.submit('main', 'create', { title: '' });

    expect(outcome).toMatchObject({ kind: 'rejected' });
    expect(client.region('main').issues).toEqual([
      { field: 'title', text: 'Название не может быть пустым' },
    ]);
    expect(end.names()).not.toContain('createTask');

    await client.submit('main', 'create', { title: 'Хлеб' });

    expect(client.region('main').issues).toEqual([]);
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
  test('уведомление — во входящие: текст и ссылки; области не тронуты', async () => {
    const { client, end } = await listed();
    const revision = client.region('main').view?.revision;

    end.emit(noteOf(ASSIGNED_NOTE, 'Сыр', 'e-1'));
    await end.flush();

    expect(client.inbox).toStrictEqual([
      { text: 'Вам назначена задача: Сыр', links: [ASSIGNED] },
    ]);
    expect(client.region('main').view?.revision).toBe(revision);
    expect(client.region('side').view).toBeUndefined();
  });

  test('повтор уведомления с тем же eventId отсеян', async () => {
    const { client, end } = tab();

    end.emit(noteOf(ASSIGNED_NOTE, 'Сыр', 'e-1'));
    end.emit(noteOf(ASSIGNED_NOTE, 'Сыр', 'e-1'));
    await end.flush();

    expect(client.inbox).toHaveLength(1);
  });

  test('тот же eventId у другого уведомления и другой eventId у того же — не повторы', async () => {
    const { client, end } = tab();

    end.emit(noteOf(ASSIGNED_NOTE, 'Сыр', 'e-1'));
    end.emit(noteOf(COMPLETED_NOTE, 'Сыр', 'e-1'));
    end.emit(noteOf(ASSIGNED_NOTE, 'Сыр', 'e-2'));
    await end.flush();

    expect(client.inbox.map((n) => n.text)).toEqual([
      'Вам назначена задача: Сыр',
      'Поручение выполнено: Сыр',
      'Вам назначена задача: Сыр',
    ]);
  });

  test('уведомление с неизвестным id — не показано, без броска; запись defect без данных', async () => {
    const { client, end, observer } = tab();

    end.emit(noteOf('exampleUi/todo/нетТакого', 'Секрет', 'e-1'));
    await end.flush();

    expect(client.inbox).toEqual([]);
    const defects = observer.records.filter((r) => r.kind === 'defect');
    expect(defects).toMatchObject([
      { node: 'exampleUi/todo/нетТакого', text: PAGE_DEFECTS.noView },
    ]);
    expect(JSON.stringify(defects)).not.toContain('Секрет');
  });

  test('данные уведомления не по схеме представления — не показаны, defect; верное с тем же ключом позже показано', async () => {
    const { client, end, observer } = tab();

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
    expect(client.inbox.map((n) => n.text)).toEqual([
      'Вам назначена задача: Сыр',
    ]);
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
    const link = client.inbox[0]?.links[0];
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

  test('неизвестный маршрут во время загрузки: область пуста с заметкой, опоздавший экземпляр закрыт', async () => {
    const end = new StubEnd().answer('listTasks', ok(TASKS)).hold('listTasks');
    const { client } = tab(end);

    const routing = client.route('/');
    await client.route('/нет');
    end.release('listTasks');
    await routing;
    await end.flush();

    expect(client.region('main')).toEqual({
      status: 'empty',
      refreshing: false,
      note: PAGE_NOTES.notFound,
      issues: [],
    });
    expect(end.unwatches()).toEqual([watchOf(end, LIST_ID)]);
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

    await client.route('/нет');
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
    client.source('main').subscribe(() => {
      if (armed) throw boom;
    });
    armed = true;

    await client.route('/нет');

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
