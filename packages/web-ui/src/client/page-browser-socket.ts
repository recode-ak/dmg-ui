import { SOCKET_NORMAL_CLOSE } from './page-socket.const';
import type { PageSocket, PageSocketEvents } from './page-socket.types';

/**
 * Адаптер сокета браузера к порту `PageSocket` (D-UI-71). Подписка — через
 * `onmessage` и `onclose`; `onerror` пуст: за ошибкой всегда приходит
 * закрытие. Клиент сокета среды тестов повторяет этот API — адаптер покрывает
 * тест на настоящем сокете.
 */
export class PageBrowserSocket implements PageSocket {
  constructor(private readonly socket: WebSocket) {}

  send(text: string): void {
    this.socket.send(text);
  }

  /** Закрытие вкладкой — обычным кодом. */
  close(): void {
    this.socket.close(SOCKET_NORMAL_CLOSE);
  }

  listen(events: PageSocketEvents): void {
    this.socket.onmessage = (event) => events.message(event.data);
    this.socket.onclose = (event) => events.closed(event.code);
    this.socket.onerror = () => {};
  }
}
