import type { Result } from 'dmg-core';
import type {
  ClientMessage,
  HelloContext,
  ServerMessage,
} from './page-messages.types';

/**
 * Серверный конец одного соединения: строки JSON клиента по порядку.
 * `receive` завершается, когда сервер обработал строку (ответ уже отправлен).
 */
export type ServerLink = {
  receive(raw: string): Promise<void>;
  close(): void;
};

/**
 * Порт серверной половины для провода — строки JSON в обе стороны (D-UI-71).
 * Порт структурный: сервер провод не импортирует. `push` — строки JSON
 * сервера этому соединению, уже готовые к отправке (предел меряется на них);
 * первой — `hello`. Токен не принят — `refused`. После пуша `hello` `connect`
 * разрешается без дальнейших `await`: иначе мост сокета примет кадр честного
 * клиента, ответившего на `hello`, за кадр до установки связи.
 */
export type PageServerPort = {
  connect(
    token: string,
    push: (text: string) => void,
  ): Promise<Result<ServerLink, 'refused'>>;
};

/**
 * Клиентский конец провода — всё, что видит клиент о сервере: контекст из
 * `hello`, отправка, сообщения сервера (уже проверенные схемой), обрыв
 * (отброшенное сообщение сервера или закрытие) и закрытие. Промис
 * обработчика сообщения — «обработка завершена»: его ждёт провод в памяти
 * (`PageWire.settled()`), конец сокета — нет.
 */
export type ClientEnd = {
  readonly context: HelloContext;
  send(message: ClientMessage): void;
  onMessage(handler: (message: ServerMessage) => Promise<void> | void): void;
  onBreak(handler: (error: Error) => void): void;
  close(): void;
};
