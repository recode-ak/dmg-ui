import { err, ok, type Result } from 'dmg-core';
import type { RenderContext } from 'dmg-ui';
import { serverFrame } from './page-frames';
import type {
  ClientMessage,
  ServerMessage as ServerMessageType,
} from './page-messages.types';
import type { ClientEnd, PageServerPort, ServerLink } from './page-wire.types';

/**
 * Провод в памяти — одно соединение; между концами только строки JSON,
 * журнал `messages` — в порядке отправки. Порядок в каждую сторону
 * сохраняется: сервер начинает строки по порядку, обрабатывает параллельно.
 * Строка сервера длиннее предела или не по схеме клиенту не доставляется:
 * это ошибка провода (`settled()` бросает) и обрыв для клиента — как и `close`.
 */
export class PageWire {
  private readonly journal: string[] = [];
  private readonly handlers: ((
    message: ServerMessageType,
  ) => Promise<void> | void)[] = [];
  private readonly breaks: ((error: Error) => void)[] = [];
  /** Незавершённая работа обеих сторон, с промисами обработчиков, — для `settled()`. */
  private readonly running = new Set<Promise<void>>();
  private readonly errors: unknown[] = [];
  private toServer: Promise<void> = Promise.resolve();
  private toClient: Promise<void> = Promise.resolve();
  private started = false;
  private closed = false;
  /** Контекст из `hello`, пока соединение устанавливается. */
  private hello: RenderContext | undefined;
  private open = false;

  constructor(private readonly server: PageServerPort) {}

  /** Строки JSON обеих сторон в порядке отправки. */
  get messages(): readonly string[] {
    return this.journal;
  }

  /**
   * Соединение по токену: клиентский конец — после `hello`. Сервер отказал
   * или не прислал `hello` — `refused`. Второй `connect` — ошибка теста,
   * бросок: один провод — одно соединение.
   */
  async connect(token: string): Promise<Result<ClientEnd, 'refused'>> {
    if (this.started) {
      throw new Error('PageWire: провод уже соединён — один на соединение');
    }
    this.started = true;
    const res = await this.server.connect(token, (text) =>
      this.fromServer(text),
    );
    if (!res.ok) return err('refused');
    const context = this.hello;
    if (context === undefined) {
      res.value.close();
      return err('refused');
    }
    this.open = true;
    const link = res.value;
    return ok({
      context,
      send: (message) => this.send(link, message),
      onMessage: (handler) => {
        this.handlers.push(handler);
      },
      onBreak: (handler) => {
        this.breaks.push(handler);
      },
      close: () => this.close(link),
    });
  }

  /**
   * Ждёт, пока вся работа провода не завершится — доставки, обработка
   * сервера и промисы обработчиков клиента; без таймеров (TST-04). Бросок —
   * после ожидания, первым.
   * @see ./page-wire.test.ts — «обработчик сигнала шлёт call и ждёт result по тому же проводу»
   */
  async settled(): Promise<void> {
    while (this.running.size > 0) await Promise.all([...this.running]);
    const [error] = this.errors.splice(0);
    if (error !== undefined) throw error;
  }

  private send(link: ServerLink, message: ClientMessage): void {
    if (this.closed) return;
    const text = JSON.stringify(message);
    this.journal.push(text);
    this.toServer = this.later(this.toServer, () => link.receive(text));
  }

  /** Закрытие — после уже отправленного; дальше клиент серверу не пишет. */
  private close(link: ServerLink): void {
    if (this.closed) return;
    this.closed = true;
    this.toServer = this.later(this.toServer, () => link.close());
    this.broken(new Error('PageWire: соединение закрыто'));
  }

  private fromServer(text: string): void {
    this.journal.push(text);
    if (!this.open) {
      this.handshake(text);
      return;
    }
    this.toClient = this.later(this.toClient, () => this.deliver(text));
  }

  /** До открытия конца принимается только `hello`; прочее — некому доставить. */
  private handshake(text: string): void {
    const parsed = serverFrame(text);
    if (
      parsed.ok &&
      parsed.value.kind === 'hello' &&
      this.hello === undefined
    ) {
      this.hello = parsed.value.context;
    }
  }

  /** Доставка обработчикам; завершается вместе с их промисами. */
  private async deliver(text: string): Promise<void> {
    if (this.closed) return;
    const parsed = serverFrame(text);
    if (!parsed.ok) {
      const error = new Error(
        parsed.error === 'too-large'
          ? 'PageWire: сообщение сервера длиннее предела'
          : 'PageWire: сообщение сервера не по схеме',
      );
      this.errors.push(error);
      this.broken(error);
      return;
    }
    const message = parsed.value;
    await Promise.all([...this.handlers].map((handler) => handler(message)));
  }

  /** Обрыв для клиента: ожидающие ответа узнают о нём сразу. */
  private broken(error: Error): void {
    for (const handler of [...this.breaks]) handler(error);
  }

  /**
   * Шаг очереди одной стороны: начинается после предыдущего и разрешается,
   * как только работа начата, — следующий шаг не ждёт её конца, поэтому
   * обработчик, ждущий ответа сервера, не запирает очередь. Работа
   * отслеживается до завершения; бросок копится для `settled()`.
   */
  private later(
    queue: Promise<void>,
    work: () => Promise<void> | void,
  ): Promise<void> {
    const step = queue.then(() => {
      // Синхронный бросок `work` — тоже отказ промиса, а не разрыв очереди.
      this.track((async () => work())());
    });
    this.track(step);
    return step;
  }

  private track(work: Promise<void>): void {
    const done: Promise<void> = work
      .catch((error: unknown) => {
        this.errors.push(error);
      })
      .finally(() => {
        this.running.delete(done);
      });
    this.running.add(done);
  }
}
