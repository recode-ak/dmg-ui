import type { Result } from 'dmg-core';
import type { RenderContext } from 'dmg-ui';
import type { ClientMessage, ServerMessage } from './page-messages.types';

/**
 * Серверный конец одного соединения: строки JSON клиента по порядку.
 * `receive` завершается, когда сервер обработал строку (ответ уже отправлен).
 */
export type ServerLink = {
  receive(raw: string): Promise<void>;
  close(): void;
};

/**
 * Порт серверной половины для провода — структурный: сервер провод не
 * импортирует. `push` — сообщения сервера этому соединению; первым —
 * `hello`. Токен не принят — `refused`.
 */
export type PageServerPort = {
  connect(
    token: string,
    push: (message: ServerMessage) => void,
  ): Promise<Result<ServerLink, 'refused'>>;
};

/**
 * Клиентский конец провода — всё, что видит клиент о сервере: контекст из
 * `hello`, отправка, сообщения сервера (уже проверенные схемой) и закрытие.
 */
export type ClientEnd = {
  readonly context: RenderContext;
  send(message: ClientMessage): void;
  onMessage(handler: (message: ServerMessage) => void): void;
  close(): void;
};
