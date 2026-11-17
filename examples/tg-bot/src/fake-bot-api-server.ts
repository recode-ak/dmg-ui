/** Вызов поддельного Bot API: метод, путь запроса и тело JSON как пришло. */
export type FakeBotApiCall = {
  readonly method: string;
  readonly path: string;
  readonly body: Record<string, unknown>;
};

/** Ответ поддельного Bot API: статус HTTP и тело (JSON или сырой текст). */
export type FakeBotApiReply = {
  readonly status?: number;
  readonly body?: unknown;
  readonly raw?: string;
};

/**
 * Ответчик метода. `signal` — отмена запроса клиентом: долгий опрос ждёт её,
 * а не таймера.
 */
export type FakeBotApiResponder = (
  call: FakeBotApiCall,
  signal: AbortSignal,
) => FakeBotApiReply | Promise<FakeBotApiReply>;

/**
 * Поддельный Bot API на loopback (`127.0.0.1`, порт назначает ОС): тесты
 * адаптера и опроса примера без внешней сети. Пишет вызовы как есть; метод без
 * ответчика получает `{ ok: true, result: true }`. Ожидание — по событиям
 * (`reached`, `idle`), без таймеров. Токена не знает: путь — часть вызова.
 */
export class FakeBotApiServer {
  readonly calls: FakeBotApiCall[] = [];
  readonly apiRoot: string;
  private readonly server: ReturnType<typeof Bun.serve>;
  private open = 0;
  private watchers: {
    predicate: (calls: readonly FakeBotApiCall[]) => boolean;
    resolve: () => void;
  }[] = [];
  private idlers: (() => void)[] = [];

  private constructor(
    private readonly responders: Readonly<Record<string, FakeBotApiResponder>>,
  ) {
    this.server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch: (request) => this.handle(request),
    });
    this.apiRoot = `http://127.0.0.1:${this.server.port}`;
  }

  static start(
    responders: Readonly<Record<string, FakeBotApiResponder>> = {},
  ): FakeBotApiServer {
    return new FakeBotApiServer(responders);
  }

  /** Ответ `{ ok: true, result }` в формате Bot API. */
  static result(result: unknown): FakeBotApiReply {
    return { body: { ok: true, result } };
  }

  /** Долгий опрос: ответ — пустой список, когда клиент отменит запрос. */
  static untilAborted(signal: AbortSignal): Promise<FakeBotApiReply> {
    return new Promise((resolve) => {
      const done = () => resolve(FakeBotApiServer.result([]));
      if (signal.aborted) done();
      else signal.addEventListener('abort', done, { once: true });
    });
  }

  /** Разрешается, когда журнал вызовов удовлетворяет условию (сразу, если уже так). */
  reached(
    predicate: (calls: readonly FakeBotApiCall[]) => boolean,
  ): Promise<void> {
    if (predicate(this.calls)) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this.watchers.push({ predicate, resolve });
    });
  }

  /** Разрешается, когда нет ни одного запроса без ответа (в том числе отменённого клиентом). */
  idle(): Promise<void> {
    if (this.open === 0) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this.idlers.push(resolve);
    });
  }

  /** Вызовы одного метода по порядку. */
  of(method: string): FakeBotApiCall[] {
    return this.calls.filter((call) => call.method === method);
  }

  /** Закрывает сервер вместе с открытыми соединениями. */
  async stop(): Promise<void> {
    await this.server.stop(true);
  }

  private async handle(request: Request): Promise<Response> {
    this.open += 1;
    try {
      const path = new URL(request.url).pathname;
      const method = path.split('/').at(-1) ?? '';
      const text = await request.text();
      const body = (text === '' ? {} : JSON.parse(text)) as Record<
        string,
        unknown
      >;
      const call: FakeBotApiCall = { method, path, body };
      this.calls.push(call);
      this.notify();
      const responder = this.responders[method];
      const reply = responder
        ? await responder(call, request.signal)
        : { body: { ok: true, result: true } };
      return reply.raw !== undefined
        ? new Response(reply.raw, { status: reply.status ?? 200 })
        : Response.json(reply.body, { status: reply.status ?? 200 });
    } finally {
      this.open -= 1;
      if (this.open === 0) {
        for (const resolve of this.idlers.splice(0)) resolve();
      }
    }
  }

  private notify(): void {
    const ready = this.watchers.filter(({ predicate }) =>
      predicate(this.calls),
    );
    this.watchers = this.watchers.filter((watcher) => !ready.includes(watcher));
    for (const { resolve } of ready) resolve();
  }
}
