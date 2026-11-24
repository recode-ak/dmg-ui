import {
  DelegateCaller,
  type DomainError,
  ok,
  type Result,
  Trace,
  UserCaller,
} from 'dmg-core';
import {
  AwaitingBus,
  MemoryLogger,
  testTrace,
  testUuid,
} from 'dmg-core/testing';
import {
  AssignTaskUcDef,
  CreateTaskUcDef,
  ExampleApp,
  type ExampleUser,
  ListTasksUcDef,
  TodoModuleDef,
} from 'dmg-core/testing/example';
import type { AnyUiAppDef } from 'dmg-ui';
import {
  type ConversationExit,
  Conversations,
  MemoryConversationStore,
} from 'dmg-ui/chat-ui';
import {
  ExampleDialogUiAppDef,
  exampleDialogViews,
  MemoryMessenger,
} from 'dmg-ui/chat-ui/testing';
import {
  ApiAppDispatch,
  type PersonPlaces,
  type RecipientCallers,
  type UcDispatch,
  UiNotifier,
  UiServer,
} from 'dmg-ui/server';
import {
  type ExampleCodeOverrides,
  ExampleUiSetDef,
  exampleCodes,
  MemoryUiObserver,
} from 'dmg-ui/testing';
import { T0 } from 'dmg-ui/testing/fixtures';
import {
  PageClient,
  type PageHistoryPort,
  PageHost,
  type PagePlacement,
  PageWire,
} from 'dmg-ui/web-ui';
import {
  ExamplePagesUiAppDef,
  examplePagesRoutes,
  exampleSubjectWire,
} from 'dmg-ui/web-ui/testing';
import { DialogPerson, type Who } from './dialog-person';
import { PageTab } from './page-tab';

/** Владелец задач. */
export const A = testUuid(1);
/** Исполнитель. */
export const B = testUuid(2);
/** Администратор: подставной `callers` выдаёт ему роль `admin`. */
export const C = testUuid(3);

const WHO: Readonly<Record<string, Who>> = {
  [A]: { peer: 'peer-a', sender: 'sender-a' },
  [B]: { peer: 'peer-b', sender: 'sender-b' },
  [C]: { peer: 'peer-c', sender: 'sender-c' },
};
const TOKENS: Readonly<Record<string, string>> = {
  [A]: 'tA',
  [B]: 'tB',
  [C]: 'tC',
};
const TOKEN_OWNERS: ReadonlyMap<string, string> = new Map(
  Object.entries(TOKENS).map(([uuid, token]) => [token, uuid]),
);

const places: PersonPlaces = {
  place: async () => ({ locale: 'ru-RU', timeZone: 'Asia/Oral' }),
};

/** Настройки мира приёмки; по умолчанию — основная беседа и учебные коды. */
export type WorldOptions = {
  /** Каталог данных приложения мира (отдельный на мир). */
  readonly dataDir: string;
  /** Подмена кода узлов примера — в сборках кода обоих приложений. */
  readonly codes?: ExampleCodeOverrides;
  /** Приложение беседы; по умолчанию — `ExampleDialogUiAppDef`. */
  readonly dialogApp?: AnyUiAppDef;
  /** Порт выхода беседы: принять ли выход. */
  readonly exits?: (exit: ConversationExit) => boolean;
};

/** Дополнения вкладки страницы: история браузера и размещения областей. */
export type TabExtra = {
  readonly history?: PageHistoryPort;
  readonly placements?: readonly PagePlacement[];
};

/**
 * Общий мир приёмки: приложение примера, сервер UI, шина, наблюдатель и три
 * человека — владелец `A`, исполнитель `B`, администратор `C`. Один код
 * экранов и один сервер на беседу и страницу; сервер считает вызовы UC, чтобы
 * тесты видели, что выделение и отключённое действие в UC не ходят. Домен-
 * помощники (`createTask`, `assignTask`, …) работают в обход каналов.
 */
export class AcceptanceWorld {
  readonly bus = new AwaitingBus();
  readonly context = { bus: this.bus, logger: new MemoryLogger() };
  readonly example: ExampleApp;
  readonly observer = new MemoryUiObserver();
  readonly messenger = MemoryMessenger.editing();
  readonly store = new MemoryConversationStore();
  readonly server: UiServer<ExampleUser>;
  /** Имена UC, которые дошли до приложения, по порядку. */
  readonly calls: string[] = [];
  /** Кто из людей сейчас администратор; смена — между показами. */
  readonly administrators = new Set<string>([C]);
  /** Кто из людей сейчас работает заместителем «только чтение»; смена — между показами. */
  readonly deputies = new Set<string>();
  readonly callers: RecipientCallers<ExampleUser>;
  readonly conversations: Conversations<ExampleUser>;
  private readonly inner: ApiAppDispatch<ExampleUser>;
  private readonly persons = new Map<string, DialogPerson>();
  private dialogNotifier = false;
  private host: PageHost<ExampleUser> | undefined;
  private tabRequests = 0;
  private dialogRequests = 0;

  constructor(private readonly options: WorldOptions) {
    this.example = new ExampleApp(
      {
        mode: 'test',
        dataDir: options.dataDir,
        users: [A, B, C],
      },
      { ...this.context, clock: () => T0 },
    );
    this.inner = new ApiAppDispatch(this.example.api);
    const dispatch: UcDispatch<ExampleUser> = {
      dispatch: async (request) => {
        this.calls.push(request.uc.name);
        return this.inner.dispatch(request);
      },
    };
    this.callers = {
      resolve: async (uuid, trace) => {
        if (this.administrators.has(uuid)) {
          return ok(
            new UserCaller({ uuid, hasRole: (role) => role === 'admin' }),
          );
        }
        const caller = await this.example.callers.resolve(uuid, trace);
        if (!caller.ok || !this.deputies.has(uuid)) return caller;
        const subject = caller.value.subject();
        if (subject === undefined) return caller;
        return ok(
          new DelegateCaller<ExampleUser>(subject, subject, `d-${uuid}`, true),
        );
      },
    };
    this.server = new UiServer({
      set: ExampleUiSetDef,
      dispatch,
      context: this.context,
    });
    const exits = options.exits;
    this.conversations = new Conversations({
      app: this.dialogApp(),
      codes: this.codes(this.dialogApp()),
      server: this.server,
      views: exampleDialogViews,
      observer: this.observer,
      messenger: this.messenger,
      store: this.store,
      logger: this.context.logger,
      people: async (sender) =>
        Object.entries(WHO).find(([, who]) => who.sender === sender)?.[0],
      peers: async (uuid) => WHO[uuid]?.peer,
      callers: this.callers,
      places,
      requestIds: () => {
        this.dialogRequests += 1;
        return `r-${this.dialogRequests}`;
      },
      ...(exits === undefined
        ? {}
        : { exits: { accept: async (exit) => exits(exit) } }),
    });
  }

  private dialogApp(): AnyUiAppDef {
    return this.options.dialogApp ?? ExampleDialogUiAppDef;
  }

  /** Сборка кода приложения `app` с подменой узлов мира. */
  private codes(app: AnyUiAppDef) {
    return exampleCodes(this.options.codes, app);
  }

  /** Беседа человека `uuid`; первое обращение запускает рассыльщика уведомлений беседы. */
  person(uuid: string): DialogPerson {
    if (!this.dialogNotifier) {
      this.dialogNotifier = true;
      new UiNotifier({
        app: this.dialogApp(),
        codes: this.codes(this.dialogApp()),
        dispatch: this.inner,
        callers: this.callers,
        delivery: { deliver: async () => {} },
        observer: this.observer,
        context: this.context,
      }).start();
    }
    const known = this.persons.get(uuid);
    if (known !== undefined) return known;
    const who = WHO[uuid];
    if (who === undefined) throw new Error(`нет собеседника ${uuid}`);
    const person = new DialogPerson(
      uuid,
      who,
      this.conversations,
      this.messenger,
      this.bus,
    );
    this.persons.set(uuid, person);
    return person;
  }

  /** Хост страниц мира; первое обращение запускает рассыльщика страниц. */
  private pages(): PageHost<ExampleUser> {
    if (this.host !== undefined) return this.host;
    const host = new PageHost({
      app: ExamplePagesUiAppDef,
      server: this.server,
      tokens: async (token) => TOKEN_OWNERS.get(token),
      callers: this.callers,
      places,
      logger: this.context.logger,
      subjectToWire: exampleSubjectWire.toWire,
    });
    new UiNotifier({
      app: ExamplePagesUiAppDef,
      codes: this.codes(ExamplePagesUiAppDef),
      dispatch: this.inner,
      callers: this.callers,
      delivery: host.delivery,
      observer: this.observer,
      context: this.context,
    }).start();
    this.host = host;
    return host;
  }

  /** Новое соединение человека `uuid` и клиент вкладки на нём; id запросов — одна последовательность на мир. */
  async tab(uuid: string, extra: TabExtra = {}): Promise<PageTab> {
    const wire = new PageWire(this.pages());
    const token = TOKENS[uuid];
    if (token === undefined) throw new Error(`нет пропуска ${uuid}`);
    const connected = await wire.connect(token);
    if (!connected.ok) throw new Error(`connect(${token}): отказ`);
    const client = new PageClient({
      app: ExamplePagesUiAppDef,
      codes: this.codes(ExamplePagesUiAppDef),
      routes: examplePagesRoutes,
      end: connected.value,
      observer: this.observer,
      reviveSubject: exampleSubjectWire.revive,
      requestIds: () => {
        this.tabRequests += 1;
        return `p-${this.tabRequests}`;
      },
      ...(extra.history === undefined ? {} : { history: extra.history }),
      ...(extra.placements === undefined
        ? {}
        : { placements: extra.placements }),
    });
    return new PageTab(client, wire);
  }

  /** Прямой вызов UC по проводу страницы, минуя клиент: сообщения сервера в ответ. */
  async directCall(
    uuid: string,
    call: { readonly uc: string; readonly input: unknown },
  ): Promise<unknown[]> {
    const wire = new PageWire(this.pages());
    const token = TOKENS[uuid];
    if (token === undefined) throw new Error(`нет пропуска ${uuid}`);
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
  }

  /** Операция приложения от имени `uuid` (учебный резолвер: роли у него нет). */
  private async asUser(uuid: string, requestId: string) {
    const trace = Trace.fromRequest({ requestId });
    const caller = await this.example.callers.resolve(uuid, trace);
    if (!caller.ok) throw new Error(`вызывающий ${uuid} не найден`);
    return { caller: caller.value, trace };
  }

  /** `owner` создаёт задачу `title`. */
  async createTask(owner: string, title: string): Promise<string> {
    const at = await this.asUser(owner, `r-create-${owner}-${title}`);
    const created = await this.example.api.dispatch(
      TodoModuleDef,
      CreateTaskUcDef.command({ title }),
      at.caller,
      at.trace,
    );
    if (!created.ok) throw new Error('createTask: отказ');
    return created.value.taskId;
  }

  /** `owner` поручает задачу `taskId` человеку `assigneeId`. */
  async assignTask(
    owner: string,
    taskId: string,
    assigneeId: string,
  ): Promise<void> {
    const at = await this.asUser(owner, `r-assign-${taskId}-${assigneeId}`);
    const assigned = await this.example.api.dispatch(
      TodoModuleDef,
      AssignTaskUcDef.command({ taskId, assigneeId }),
      at.caller,
      at.trace,
    );
    if (!assigned.ok) throw new Error('assignTask: отказ');
    await this.bus.delivered();
  }

  /** `B` создаёт задачу `title` и назначает её на `A`: у `A` на одно поручение больше. */
  async assignToA(title = 'Хлеб'): Promise<void> {
    await this.assignTask(B, await this.createTask(B, title), A);
  }

  /** Владелец `A` создал «Хлеб» и поручил его `B`, «Молоко» — `C`. */
  async assignedToBAndC(): Promise<void> {
    await this.assignTask(A, await this.createTask(A, 'Хлеб'), B);
    await this.assignTask(A, await this.createTask(A, 'Молоко'), C);
  }

  /** `A` создаёт себе задачу: владелец видит её в списке и может выполнить. */
  async ownTask(title = 'Хлеб'): Promise<void> {
    await this.createTask(A, title);
    await this.bus.delivered();
  }

  /** Задачи владельца `owner` (по умолчанию `A`): название и статус. */
  async tasksOf(owner = A) {
    const at = await this.asUser(owner, 'r-list');
    const listed: Result<
      readonly { title: string; status: string }[],
      DomainError
    > = await this.example.api.dispatch(
      TodoModuleDef,
      ListTasksUcDef.command({}),
      at.caller,
      testTrace(),
    );
    if (!listed.ok) throw new Error('listTasks: отказ');
    return listed.value.map((t) => ({ title: t.title, status: t.status }));
  }

  /** Каталог данных мира: по нему читается лог операций. */
  get dataDir(): string {
    return this.options.dataDir;
  }
}
