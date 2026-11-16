import { type AnyUseCaseDef, ok, type SerializedResult, Trace } from 'dmg-core';
import { ListTasksUcDef } from 'dmg-core/testing/example';
import {
  type AddressJson,
  type AnyUiSetDef,
  CodeLoader,
  CodeLoaders,
  type NotificationCode,
  type RefreshPort,
  type RefreshSignal,
  type RenderContext,
  type ScreenCode,
  ScreenRuntime,
  type UcCall,
  type UcPort,
  type UiObserver,
  type UiRecord,
} from 'dmg-ui';
import {
  ExampleUiSetDef,
  TASK_A,
  TASK_B,
  TaskAssignedNotificationDef,
  TaskCardScreenDef,
  TaskListScreenDef,
} from './ui-fixture';
import { TaskCardScreenCode, TaskListScreenCode } from './ui-fixture-code';
import { TaskAssignedNotificationCode } from './ui-notification-code';

// Заглушки портов исполнителя и наблюдатель в памяти — фикстура тестов
// `runtime/` (из входа `testing` до Ф5 не экспортируется, Т-8 брифа Ф4).

/** `id` экранов фикстуры. */
export const LIST_ID = 'exampleUi/todo/taskList';
export const CARD_ID = 'exampleUi/todo/taskCard';

/** Выход `listTasks` по умолчанию: открытая и выполненная задача. */
export const TASKS = [
  { uuid: TASK_A, title: 'Хлеб', status: 'open' },
  { uuid: TASK_B, title: 'Молоко', status: 'done' },
] as const;

/** Контекст рендера по умолчанию: свой вызывающий, не только чтение. */
export const testRenderContext: RenderContext = {
  locale: 'ru-RU',
  timeZone: 'Asia/Oral',
  delegate: false,
  readOnly: false,
};

/** След входящего сигнала канала с заданным `requestId`. */
export const requestTrace = (requestId: string) =>
  Trace.fromRequest({ requestId }).toJSON();

/** Сигнал перечитывания: след — причина-событие, цепочка запроса `correlationId`. */
export const refreshSignal = (
  event: string,
  eventId: string,
  correlationId = 'r-cause',
): RefreshSignal => ({
  event,
  eventId,
  trace: Trace.fromEvent({ eventId, correlationId }).toJSON(),
});

type Answer =
  | SerializedResult
  | ((call: UcCall) => SerializedResult | Promise<SerializedResult>);

/** Порт вызова UC: записывает вызовы, отвечает заданным по имени UC. */
export class StubUcPort implements UcPort {
  readonly calls: UcCall[] = [];
  private readonly answers = new Map<string, Answer>();

  answer(uc: AnyUseCaseDef, result: Answer): this {
    this.answers.set(uc.name, result);
    return this;
  }

  /** Ответ на `uc` ждёт, пока тест не вызовет возвращённую функцию. */
  hold(uc: AnyUseCaseDef): (result: SerializedResult) => void {
    let release: (result: SerializedResult) => void = () => {};
    const gate = new Promise<SerializedResult>((resolve) => {
      release = resolve;
    });
    this.answer(uc, () => gate);
    return (result) => release(result);
  }

  /** Имена вызванных UC по порядку. */
  names(): string[] {
    return this.calls.map((call) => call.uc);
  }

  async call(call: UcCall): Promise<SerializedResult> {
    this.calls.push(call);
    const answer = this.answers.get(call.uc);
    if (answer === undefined) {
      throw new Error(`StubUcPort: нет ответа на ${call.uc}`);
    }
    return typeof answer === 'function' ? answer(call) : answer;
  }
}

type Watch = {
  readonly address: AddressJson;
  readonly listener: (signal: RefreshSignal) => void;
};

/** Порт перечитывания: помнит подписки, `emit` раздаёт сигнал всем. */
export class StubRefreshPort implements RefreshPort {
  private readonly watches = new Set<Watch>();

  watch(
    address: AddressJson,
    listener: (signal: RefreshSignal) => void,
  ): () => void {
    const entry = { address, listener };
    this.watches.add(entry);
    return () => {
      this.watches.delete(entry);
    };
  }

  emit(signal: RefreshSignal): void {
    for (const { listener } of [...this.watches]) listener(signal);
  }

  /** Адреса действующих подписок. */
  watching(): AddressJson[] {
    return [...this.watches].map((entry) => entry.address);
  }
}

/** Наблюдатель в памяти: записи по порядку. */
export class MemoryUiObserver implements UiObserver {
  readonly records: UiRecord[] = [];

  record(entry: UiRecord): void {
    this.records.push(entry);
  }

  kinds(): string[] {
    return this.records.map((entry) => entry.kind);
  }
}

const viaJson = <T>(value: T): T => JSON.parse(JSON.stringify(value));

/** Порты через JSON в обе стороны: вызов, ответ, адрес и сигнал. */
export const jsonPorts = (
  ucs: UcPort,
  refresh: RefreshPort,
): { readonly ucs: UcPort; readonly refresh: RefreshPort } => ({
  ucs: {
    call: async (call) => viaJson(await ucs.call(viaJson(call))),
  },
  refresh: {
    watch: (address, listener) =>
      refresh.watch(viaJson(address), (signal) => listener(viaJson(signal))),
  },
});

/** Подмена кода экранов и уведомления фикстуры. */
export type FixtureCodeOverrides = {
  readonly list?: ScreenCode<typeof TaskListScreenDef>;
  readonly card?: ScreenCode<typeof TaskCardScreenDef>;
  readonly notification?: NotificationCode<typeof TaskAssignedNotificationDef>;
};

/** Загрузчики кода набора фикстуры; свежий кэш на каждый вызов. */
export const fixtureCodes = (over: FixtureCodeOverrides = {}): CodeLoaders =>
  CodeLoaders.of(ExampleUiSetDef, [
    CodeLoader.screen(
      TaskListScreenDef,
      async () => over.list ?? new TaskListScreenCode(),
    ),
    CodeLoader.screen(
      TaskCardScreenDef,
      async () => over.card ?? new TaskCardScreenCode(),
    ),
    CodeLoader.notification(
      TaskAssignedNotificationDef,
      async () => over.notification ?? new TaskAssignedNotificationCode(),
    ),
  ]);

/**
 * Исполнитель на заглушках: `listTasks` отвечает `TASKS`, остальные UC —
 * по `ucs.answer` теста.
 */
export class RuntimeKit {
  readonly ucs = new StubUcPort().answer(ListTasksUcDef, ok([...TASKS]));
  readonly refresh = new StubRefreshPort();
  readonly observer = new MemoryUiObserver();
  readonly runtime: ScreenRuntime;

  constructor(
    codes: CodeLoaders = fixtureCodes(),
    set: AnyUiSetDef = ExampleUiSetDef,
  ) {
    this.runtime = new ScreenRuntime({
      set,
      codes,
      ucs: this.ucs,
      refresh: this.refresh,
      observer: this.observer,
    });
  }

  /** Параметры `open`/`restore`: контекст поверх `testRenderContext`. */
  static options(context: Partial<RenderContext> = {}, requestId = 'r-open') {
    return {
      context: { ...testRenderContext, ...context },
      trace: requestTrace(requestId),
    };
  }

  /** Список с начала; `context` — поверх `testRenderContext`. */
  openList(context: Partial<RenderContext> = {}) {
    return this.runtime.open(
      TaskListScreenDef.at({ index: 0 }),
      RuntimeKit.options(context),
    );
  }

  /** Карточка задачи `TASK_A`. */
  openCard() {
    return this.runtime.open(
      TaskCardScreenDef.at({ taskId: TASK_A }),
      RuntimeKit.options(),
    );
  }
}
