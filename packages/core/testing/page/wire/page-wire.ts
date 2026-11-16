import { err, ok, type Result } from 'dmg-core';
import type { RenderContext } from 'dmg-ui';
import * as v from 'valibot';
import { ServerMessage } from './page-messages';
import type {
  ClientMessage,
  ServerMessage as ServerMessageType,
} from './page-messages.types';
import type { ClientEnd, PageServerPort, ServerLink } from './page-wire.types';

/**
 * Сколько ходов микрозадач провод ждёт реакцию клиента на доставленное
 * сообщение. Реакция (сигнал → перечитывание → `call`) — цепочка микрозадач
 * без ввода-вывода: её не видно в промисах провода, но за этот запас она
 * успевает отправить следующее сообщение.
 */
const QUIET_TURNS = 100;

/**
 * Провод в памяти между половинами страничного канала — одно соединение.
 * Между концами ходят только строки JSON; журнал `messages` хранит их в
 * порядке отправки обеими сторонами. Доставка асинхронная, порядок в
 * каждую сторону сохраняется: строки клиента сервер начинает обрабатывать
 * в порядке отправки (на этом держится «подписка до загрузки», расхождение
 * 4 брифа Ф6), а обрабатывает — параллельно, как настоящий транспорт.
 *
 * Сообщение сервера, не прошедшее схему `ServerMessage`, клиенту не
 * доставляется: для клиента сервер — тоже внешний вход.
 */
export class PageWire {
  private readonly journal: string[] = [];
  private readonly handlers: ((message: ServerMessageType) => void)[] = [];
  /** Незавершённые доставки и обработки обеих сторон — для `settled()`. */
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
    const res = await this.server.connect(token, (message) =>
      this.fromServer(message),
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
      close: () => this.close(link),
    });
  }

  /**
   * Ждёт тишины: все доставки и обработки завершены, и за `QUIET_TURNS`
   * ходов микрозадач новых нет. Без таймеров (Т-14). Бросок обработчика —
   * после ожидания, первым.
   */
  async settled(): Promise<void> {
    do {
      while (this.running.size > 0) await Promise.all([...this.running]);
    } while (!(await this.quiet()));
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
  }

  private fromServer(message: ServerMessageType): void {
    const text = JSON.stringify(message);
    this.journal.push(text);
    if (!this.open) {
      this.handshake(text);
      return;
    }
    this.toClient = this.later(this.toClient, () => this.deliver(text));
  }

  /** До открытия конца принимается только `hello`; прочее — некому доставить. */
  private handshake(text: string): void {
    const message = PageWire.parse(text);
    if (message?.kind === 'hello' && this.hello === undefined) {
      this.hello = message.context;
    }
  }

  private deliver(text: string): void {
    if (this.closed) return;
    const message = PageWire.parse(text);
    if (message === undefined) return;
    for (const handler of [...this.handlers]) handler(message);
  }

  /**
   * Шаг очереди одной стороны: начинается после предыдущего, работа
   * отслеживается до завершения. Очередь не рвётся на броске — бросок
   * копится для `settled()`.
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

  private async quiet(): Promise<boolean> {
    for (let turn = 0; turn < QUIET_TURNS; turn += 1) {
      await Promise.resolve();
      if (this.running.size > 0) return false;
    }
    return true;
  }

  /** Строка сервера → сообщение по схеме; не JSON или не по схеме — `undefined`. */
  private static parse(text: string): ServerMessageType | undefined {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return undefined;
    }
    const parsed = v.safeParse(ServerMessage, json);
    return parsed.success ? parsed.output : undefined;
  }
}
