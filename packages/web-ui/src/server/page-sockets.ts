import type { Result } from 'dmg-core';
import { PAGE_CHANNEL } from '../page-channel.const';
import type { RefusedMessage } from '../wire/page-messages.types';
import { PAGE_CLOSE } from '../wire/page-wire.const';
import type { ServerLink } from '../wire/page-wire.types';
import { SOCKET_LOGS } from './page-server.const';
import type {
  PageServerSocket,
  PageSocketsSpec,
  SocketState,
} from './page-server.types';

/** Ответ на двоичный кадр — тот же отказ, что на мусор (ERR-01). */
const BINARY_REFUSED: RefusedMessage = { kind: 'refused', reason: 'malformed' };

/**
 * Мост событий сокета сервера к порту серверной половины (D-UI-71): открытие —
 * `connect` по пропуску, кадр — `receive`, закрытие — освобождение связи.
 * Допущения: таймеров нет (мёртвый сокет закрывает сервер сокетов); кадр до
 * `hello` — нарушение протокола, честный клиент до него не пишет; методы
 * зовутся без `this` от сервера сокетов — привязка передаёт их лямбдами.
 * @see ./page-sockets.test.ts
 */
export class PageSockets {
  private readonly states = new Map<PageServerSocket, SocketState>();

  constructor(private readonly spec: PageSocketsSpec) {}

  /**
   * Сокет открыт: соединение по пропуску. Отказ — закрытие `PAGE_CLOSE.refused`;
   * сбой хоста — закрытие и `error`. Промис не отклоняется.
   */
  open(socket: PageServerSocket): Promise<void> {
    const state: SocketState = {
      link: undefined,
      closed: false,
      binaryWarned: false,
      opened: Promise.resolve(),
    };
    this.states.set(socket, state);
    state.opened = this.connect(socket, state);
    return state.opened;
  }

  /**
   * Кадр клиента. Строка — в `receive` сразу, без ожидания предыдущей:
   * порядок начала обработки — порядок прихода (`watch` раньше `call`).
   * Двоичный — `refused`, соединение живо. До связи — закрытие
   * `PAGE_CLOSE.protocol`. После закрытия — без действия.
   */
  message(socket: PageServerSocket, data: string | Uint8Array): void {
    const state = this.states.get(socket);
    if (state === undefined || state.closed) return;
    if (state.link === undefined) {
      state.closed = true;
      this.spec.logger.warn(PAGE_CHANNEL, SOCKET_LOGS.early);
      socket.close(PAGE_CLOSE.protocol);
      return;
    }
    if (typeof data !== 'string') {
      if (!state.binaryWarned) {
        state.binaryWarned = true;
        this.spec.logger.warn(PAGE_CHANNEL, SOCKET_LOGS.binary);
      }
      socket.send(JSON.stringify(BINARY_REFUSED));
      return;
    }
    // Текст броска не пишется: в нём может быть сообщение клиента (ERR-07).
    state.link.receive(data).catch(() => {
      this.spec.logger.error(PAGE_CHANNEL, SOCKET_LOGS.receive);
    });
  }

  /**
   * Сокет закрыт: связь закрывается — доставка, подписки и сессия
   * освобождены; если `connect` ещё идёт — по его завершении. Повтор и чужой
   * сокет — без действия. Промис разрешается, когда освобождено.
   */
  async close(socket: PageServerSocket): Promise<void> {
    const state = this.states.get(socket);
    if (state === undefined) return;
    this.states.delete(socket);
    state.closed = true;
    if (state.link === undefined) {
      await state.opened;
      return;
    }
    state.link.close();
  }

  private async connect(
    socket: PageServerSocket,
    state: SocketState,
  ): Promise<void> {
    const push = (text: string) => {
      if (!state.closed) socket.send(text);
    };
    let res: Result<ServerLink, 'refused'>;
    try {
      res = await this.spec.host.connect(socket.data.token, push);
    } catch {
      // Текст броска не пишется: в нём может быть пропуск (ERR-07).
      this.spec.logger.error(PAGE_CHANNEL, SOCKET_LOGS.connect);
      this.refuse(socket, state);
      return;
    }
    if (!res.ok) {
      this.refuse(socket, state);
      return;
    }
    // Сокет закрыт, пока шёл `connect`: связь закрывается сразу.
    if (state.closed) {
      res.value.close();
      return;
    }
    state.link = res.value;
  }

  /** Соединение не принято: сокет закрывается, если ещё не закрыт. */
  private refuse(socket: PageServerSocket, state: SocketState): void {
    if (state.closed) return;
    state.closed = true;
    socket.close(PAGE_CLOSE.refused);
  }
}
