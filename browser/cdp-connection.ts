import type {
  CdpListener,
  CdpMessage,
  CdpPending,
} from './cdp-connection.types';

/** Соединение с браузером по протоколу DevTools: запросы с номерами и события по сессиям. */
export class CdpConnection {
  private nextId = 1;
  private readonly pending = new Map<number, CdpPending>();
  private readonly listeners = new Set<CdpListener>();
  private closed = false;

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener('message', (event) => this.receive(event.data));
    socket.addEventListener('close', () => this.fail());
  }

  /** Открывает соединение; пока сокет не открылся, ждёт, при ошибке — бросок. */
  static async open(url: string): Promise<CdpConnection> {
    const socket = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener('open', () => resolve(), { once: true });
      socket.addEventListener(
        'error',
        () =>
          reject(new Error(`Не удалось открыть соединение DevTools: ${url}`)),
        { once: true },
      );
    });
    return new CdpConnection(socket);
  }

  /**
   * Запрос DevTools: возвращает `result` ответа с тем же номером. Поле `error`
   * ответа — бросок с именем метода; закрытие соединения — отказ.
   */
  send<T = unknown>(
    method: string,
    params?: Record<string, unknown>,
    sessionId?: string,
  ): Promise<T> {
    if (this.closed) {
      return Promise.reject(
        new Error(`DevTools ${method}: соединение закрыто`),
      );
    }
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        method,
        resolve: (result) => resolve(result as T),
        reject,
      });
      try {
        this.socket.send(JSON.stringify({ id, method, params, sessionId }));
      } catch (error) {
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /** Ждёт первое событие с этим именем от этой сессии (`undefined` — от самого браузера); возвращает его `params`. */
  once<T = unknown>(event: string, sessionId?: string): Promise<T> {
    if (this.closed) {
      return Promise.reject(new Error(`DevTools ${event}: соединение закрыто`));
    }
    return new Promise<T>((resolve, reject) => {
      const listener: CdpListener = {
        event,
        sessionId,
        resolve: (params) => resolve(params as T),
        reject,
      };
      this.listeners.add(listener);
    });
  }

  /** Закрывает соединение и ждёт закрытия сокета; повторный вызов — без действия. */
  async close(): Promise<void> {
    if (this.closed) return;
    const closed = new Promise<void>((resolve) => {
      this.socket.addEventListener('close', () => resolve(), { once: true });
    });
    this.socket.close();
    await closed;
  }

  private receive(data: unknown): void {
    const message = JSON.parse(String(data)) as CdpMessage;
    if (message.id !== undefined) {
      this.answer(message.id, message);
      return;
    }
    for (const listener of [...this.listeners]) {
      if (
        listener.event === message.method &&
        listener.sessionId === message.sessionId
      ) {
        this.listeners.delete(listener);
        listener.resolve(message.params);
      }
    }
  }

  private answer(id: number, message: CdpMessage): void {
    const waiting = this.pending.get(id);
    if (waiting === undefined) return;
    this.pending.delete(id);
    if (message.error === undefined) {
      waiting.resolve(message.result);
    } else {
      waiting.reject(
        new Error(`DevTools ${waiting.method}: ${message.error.message}`),
      );
    }
  }

  /** Сокет закрыт: все ожидающие запросы и события получают отказ. */
  private fail(): void {
    this.closed = true;
    const error = new Error('Соединение DevTools закрыто');
    for (const waiting of this.pending.values()) waiting.reject(error);
    this.pending.clear();
    for (const listener of this.listeners) listener.reject(error);
    this.listeners.clear();
  }
}
