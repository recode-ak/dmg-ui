import { err, ok, type Result } from 'dmg-core';
import type { RenderContext } from 'dmg-ui';
import { serverFrame } from '../wire/page-frames';
import type { ClientMessage, ServerMessage } from '../wire/page-messages.types';
import type { ClientEnd } from '../wire/page-wire.types';
import type { PageSocket } from './page-socket.types';

/**
 * Клиентский конец провода поверх сокета (D-UI-71). Первое сообщение сервера —
 * `hello`, иначе соединение отказано (`refused`): так конец отличает отказ до
 * `hello` от обрыва после. Плохой кадр, закрытие сокета и `close()` — обрыв
 * ровно один раз. Промис обработчика сообщения конец не ждёт: порядок задают
 * кадры сокета.
 * @see ./page-socket-end.test.ts
 */
export class PageSocketEnd implements ClientEnd {
  private readonly handlers: ((
    message: ServerMessage,
  ) => Promise<void> | void)[] = [];
  private readonly breaks: ((error: Error) => void)[] = [];
  private closed = false;

  private constructor(
    private readonly socket: PageSocket,
    readonly context: RenderContext,
  ) {}

  /**
   * Соединение по открытому сокету: подписка на события — сразу, конец — после
   * `hello`. Закрытие до `hello` или другое первое сообщение — `refused`,
   * сокет закрыт. Кадр доставляется только обработчикам, подписанным к его
   * приходу: `onMessage` — сразу после `await connect`, без других `await`
   * между ними, иначе кадр сервера теряется молча.
   */
  static connect(socket: PageSocket): Promise<Result<ClientEnd, 'refused'>> {
    const { promise, resolve } =
      Promise.withResolvers<Result<ClientEnd, 'refused'>>();
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
          resolve(err('refused'));
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
        resolve(err('refused'));
      },
    });
    return promise;
  }

  /** Строка JSON сообщения — в сокет; после закрытия — без действия. */
  send(message: ClientMessage): void {
    if (!this.closed) this.socket.send(JSON.stringify(message));
  }

  onMessage(handler: (message: ServerMessage) => Promise<void> | void): void {
    this.handlers.push(handler);
  }

  onBreak(handler: (error: Error) => void): void {
    this.breaks.push(handler);
  }

  /** Закрыть сокет; обрыв — один раз, позднее закрытие сокета второго не даёт. */
  close(): void {
    if (this.closed) return;
    this.socket.close();
    this.broken(new Error('PageSocketEnd: соединение закрыто'));
  }

  /** Кадр после `hello`: по схеме — обработчикам синхронно, иначе обрыв. */
  private receive(data: unknown): void {
    if (this.closed) return;
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
    for (const handler of [...this.handlers]) void handler(message);
  }

  /** Обрыв для клиента — один раз: дальше конец ничего не шлёт и не доставляет. */
  private broken(error: Error): void {
    if (this.closed) return;
    this.closed = true;
    for (const handler of [...this.breaks]) handler(error);
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
