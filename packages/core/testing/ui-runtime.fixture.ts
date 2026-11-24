import { type AnyUseCaseDef, ok, type SerializedResult, Trace } from 'dmg-core';
import { ListTasksUcDef } from 'dmg-core/testing/example';
import {
  type AddressJson,
  type AppCodeLoaders,
  type RefreshPort,
  type RefreshSignal,
  type RenderContext,
  ScreenRuntime,
  type UcCall,
  type UcPort,
  type UiFault,
} from 'dmg-ui';
import {
  exampleCodes,
  exampleSubject,
  TASK_A,
  TASK_B,
  TaskCardScreenDef,
  TaskListScreenDef,
} from './example';
import { MemoryUiObserver } from './memory-ui-observer';
import { taskState } from './task-state';

// Заглушки портов исполнителя на учебном примере — помощники тестов
// `runtime/` (из входа `testing` не экспортируются: деталь тестов ядра).

/** Выход `listTasks` по умолчанию: открытая и выполненная задача владельца — state целиком. */
export const TASKS = [
  taskState({ uuid: TASK_A, title: 'Хлеб', status: 'open' }),
  taskState({ uuid: TASK_B, title: 'Молоко', status: 'done' }),
];

/** Контекст рендера по умолчанию: свой вызывающий-владелец, не только чтение. */
export const testRenderContext: RenderContext = {
  locale: 'ru-RU',
  timeZone: 'Asia/Oral',
  delegate: false,
  readOnly: false,
  subject: exampleSubject,
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

/**
 * Исполнитель на заглушках: `listTasks` отвечает `TASKS`, остальные UC —
 * по `ucs.answer` теста. Набор и приложение — из сборки кода: сборка
 * приложения даёт его состав (отрезанное и подсказки дверей), сборка набора
 * — исполнитель без приложения.
 */
export class RuntimeKit {
  readonly ucs = new StubUcPort().answer(ListTasksUcDef, ok([...TASKS]));
  readonly refresh = new StubRefreshPort();
  readonly observer = new MemoryUiObserver();
  /** Сырые броски кода экрана и слушателей — точка диагностики `faults`. */
  readonly faults: UiFault[] = [];
  readonly runtime: ScreenRuntime;

  constructor(codes: AppCodeLoaders = exampleCodes()) {
    const { set, app } = codes;
    this.runtime = new ScreenRuntime({
      set,
      codes,
      ...(app === undefined ? {} : { app }),
      ucs: this.ucs,
      refresh: this.refresh,
      observer: this.observer,
      faults: (fault) => this.faults.push(fault),
    });
  }

  /** Параметры `open`/`restore`: контекст поверх `testRenderContext`. */
  static options(context: Partial<RenderContext> = {}, requestId = 'r-open') {
    return {
      context: { ...testRenderContext, ...context },
      trace: requestTrace(requestId),
    };
  }

  /** Список с первой страницы; `context` — поверх `testRenderContext`. */
  openList(context: Partial<RenderContext> = {}) {
    return this.runtime.open(
      TaskListScreenDef.at({ page: 0 }),
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
