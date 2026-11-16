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
import {
  ASSIGNED_ID,
  CARD_ID,
  exampleCodes,
  LIST_ID,
  TASK_A,
  TASK_B,
} from '../../example';
import {
  ExamplePagesAppDef,
  examplePageRoutes,
  examplePageViews,
} from '../../example/pages';
import { MemoryUiObserver } from '../../memory-ui-observer';
import type {
  ClientMessage as ClientMsg,
  ServerMessage as ServerMsg,
} from '../wire/page-messages.types';
import type { ClientEnd } from '../wire/page-wire.types';
import { PageClient } from './page-client';
import { PAGE_DEFECTS, PAGE_NOTES } from './page-client.const';

// Клиентская половина страничного канала: две области (`main`, `side`),
// политики исходов, входящие, снимок. Сервер — заглушка конца провода:
// отвечает на `call` по имени UC и умеет сам прислать сообщение. Ответы —
// микрозадачи, `flush()` отдаёт их без таймеров (TST-04).

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
  private readonly handlers: ((message: ServerMsg) => void)[] = [];
  private readonly answers = new Map<string, Answer>();

  constructor(readonly context = CONTEXT) {}

  answer(uc: string, result: Answer): this {
    this.answers.set(uc, result);
    return this;
  }

  onMessage(handler: (message: ServerMsg) => void): void {
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
    Promise.resolve().then(() =>
      this.emit({
        kind: 'result',
        id: message.id,
        result: typeof answer === 'function' ? answer(message.call) : answer,
      }),
    );
  }

  close(): void {}

  emit(message: ServerMsg): void {
    for (const handler of this.handlers) handler(message);
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

const tab = (end = new StubEnd().answer('listTasks', ok(TASKS))) => {
  let requests = 0;
  const observer = new MemoryUiObserver();
  const client = new PageClient({
    app: ExamplePagesAppDef,
    codes: exampleCodes(),
    views: examplePageViews,
    routes: examplePageRoutes,
    end,
    observer,
    requestIds: () => {
      requests += 1;
      return `r-${requests}`;
    },
  });
  return { client, end, observer };
};

/** Вкладка со списком в `main`. */
const listed = async (end?: StubEnd) => {
  const t = tab(end);
  await t.client.route('/');
  return t;
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
    const { client } = tab(end);

    await client.route('/assigned');

    expect(client.region('main').view?.screen).toBe(ASSIGNED_ID);
    expect(client.page()).toContain('Назначенные мне');
  });

  test('неизвестный маршрут — заметка в main, ничего не открыто и не отправлено', async () => {
    const { client, end } = tab();

    await client.route('/нет');

    expect(client.region('main').note).toBe('Страница не найдена');
    expect(client.region('main').view).toBeUndefined();
    expect(end.sent).toEqual([]);
  });

  test('page() — текст страницы: заголовок экрана и задачи', async () => {
    const { client } = await listed();

    expect(client.page()).toContain('Мои задачи');
    expect(client.page()).toContain('Хлеб');
  });

  test('контекст hello — в виде: только чтение видно в шапке страницы', async () => {
    const end = new StubEnd({ ...CONTEXT, readOnly: true }).answer(
      'listTasks',
      ok(TASKS),
    );
    const { client } = await listed(end);

    expect(client.region('main').view?.context).toMatchObject({
      readOnly: true,
    });
    expect(client.page()).toContain('только чтение');
  });

  test('наблюдатель исполнителя получает записи клиента', async () => {
    const { observer } = await listed();

    expect(observer.kinds()).toContain('opened');
  });
});

describe('PageClient — moved', () => {
  test('moved на тот же Def — на месте в main, прежний экземпляр закрыт', async () => {
    const { client, end } = await listed();
    const [first = ''] = end.watches();

    const outcome = await client.submit('main', 'next', {});

    expect(outcome).toMatchObject({ kind: 'moved' });
    expect(client.region('main').view?.address).toEqual({
      screen: LIST_ID,
      params: { page: 1 },
    });
    expect(client.region('side').view).toBeUndefined();
    expect(end.unwatches()).toEqual([first]);
    expect(client.page()).toContain('Сыр');
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
    const { client } = tab(end);

    await client.route('/');

    expect(client.region('main').view?.status).toBe('refused');
    expect(client.region('main').text).toContain(ErrorText.of(denied).summary);
    expect(client.region('main').text).toContain('[Повторить]');

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
