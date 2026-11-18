import { err, ok, type Result } from 'dmg-core';
import type { RenderContext } from 'dmg-ui';
import { serverFrame } from '../wire/page-frames';
import type { ClientMessage, ServerMessage } from '../wire/page-messages.types';
import { PAGE_CLOSE } from '../wire/page-wire.const';
import type { ClientEnd } from '../wire/page-wire.types';
import { EARLY_FRAMES_LIMIT } from './page-socket.const';
import type { PageDialFailure, PageSocket } from './page-socket.types';

/**
 * Клиентский конец провода поверх сокета (D-UI-71, D-UI-74). Первое сообщение
 * сервера — `hello`, иначе соединение отказано с видом отказа. Кадры до первой
 * подписки `onMessage` копятся (не больше `EARLY_FRAMES_LIMIT`) и отдаются ей
 * по порядку. Плохой кадр, закрытие сокета и `close()` — обрыв ровно один раз;
 * опоздавший к обрыву `onBreak` получает его сразу. Промис обработчика конец
 * не ждёт: порядок задают кадры сокета.
 * @see ./page-socket-end.test.ts
 */
export class PageSocketEnd implements ClientEnd {
  private readonly handlers: ((
    message: ServerMessage,
  ) => Promise<void> | void)[] = [];
  private readonly breaks: ((error: Error) => void)[] = [];
  /** Кадры после `hello` до первой подписки `onMessage`. */
  private early: ServerMessage[] = [];
  /** Ошибка обрыва; есть — конец закрыт. */
  private failure: Error | undefined;

  private constructor(
    private readonly socket: PageSocket,
    readonly context: RenderContext,
  ) {}

  /**
   * Соединение по открытому сокету: подписка на события — сразу, конец — после
   * `hello`. До `hello`: закрытие кодом `PAGE_CLOSE.refused` — `refused`, иное
   * закрытие — `closed`, другой первый кадр — `malformed` (сокет закрыт).
   * Срока у ожидания нет — его ставит вызывающий.
   */
  static connect(
    socket: PageSocket,
  ): Promise<Result<ClientEnd, PageDialFailure>> {
    const { promise, resolve } =
      Promise.withResolvers<Result<ClientEnd, PageDialFailure>>();
    let end: PageSocketEnd | undefined;
    let settled = false;
    socket.listen({
      message: (data) => {
        if (end !== undefined) {
          end.receive(data);
          return;
        }
        if (settled) return;
        settled = true;
        const hello = PageSocketEnd.hello(data);
        if (hello === undefined) {
          socket.close();
          resolve(err('malformed'));
          return;
        }
        end = new PageSocketEnd(socket, hello);
        resolve(ok(end));
      },
      closed: (code) => {
        if (end !== undefined) {
          end.broken(new Error(`PageSocketEnd: сокет закрыт, код ${code}`));
          return;
        }
        if (settled) return;
        settled = true;
        resolve(err(code === PAGE_CLOSE.refused ? 'refused' : 'closed'));
      },
    });
    return promise;
  }

  /** Строка JSON сообщения — в сокет; после закрытия — без действия. */
  send(message: ClientMessage): void {
    if (this.failure === undefined) this.socket.send(JSON.stringify(message));
  }

  /** Первый обработчик сразу получает накопленные кадры по порядку. */
  onMessage(handler: (message: ServerMessage) => Promise<void> | void): void {
    this.handlers.push(handler);
    if (this.handlers.length > 1) return;
    const early = this.early;
    this.early = [];
    for (const message of early) void handler(message);
  }

  /** После обрыва обработчик зовётся сразу той же ошибкой. */
  onBreak(handler: (error: Error) => void): void {
    if (this.failure !== undefined) {
      handler(this.failure);
      return;
    }
    this.breaks.push(handler);
  }

  /** Закрыть сокет; обрыв — один раз, позднее закрытие сокета второго не даёт. */
  close(): void {
    if (this.failure !== undefined) return;
    this.socket.close();
    this.broken(new Error('PageSocketEnd: соединение закрыто'));
  }

  /**
   * Кадр после `hello`: по схеме — обработчикам синхронно (до первой
   * подписки — в накопление), иначе обрыв.
   */
  private receive(data: unknown): void {
    if (this.failure !== undefined) return;
    const parsed =
      typeof data === 'string' ? serverFrame(data) : err('malformed');
    if (!parsed.ok) {
      this.socket.close();
      this.broken(
        new Error(
          parsed.error === 'too-large'
            ? 'PageSocketEnd: сообщение сервера длиннее предела'
            : 'PageSocketEnd: сообщение сервера не по схеме',
        ),
      );
      return;
    }
    const message = parsed.value;
    if (this.handlers.length === 0) {
      if (this.early.length >= EARLY_FRAMES_LIMIT) {
        this.socket.close();
        this.broken(
          new Error('PageSocketEnd: кадров до подписки больше предела'),
        );
        return;
      }
      this.early.push(message);
      return;
    }
    for (const handler of [...this.handlers]) void handler(message);
  }

  /** Обрыв для клиента — один раз: дальше конец ничего не шлёт и не доставляет. */
  private broken(error: Error): void {
    if (this.failure !== undefined) return;
    this.failure = error;
    this.early = [];
    const handlers = [...this.breaks];
    this.breaks.length = 0;
    for (const handler of handlers) handler(error);
  }

  /** Контекст из первого кадра, если он — `hello` по схеме. */
  private static hello(data: unknown): RenderContext | undefined {
    if (typeof data !== 'string') return undefined;
    const parsed = serverFrame(data);
    return parsed.ok && parsed.value.kind === 'hello'
      ? parsed.value.context
      : undefined;
  }
}
