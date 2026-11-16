import type { SerializedResult } from 'dmg-core';
import type { AddressJson, RefreshSignal, RenderContext, UcCall } from 'dmg-ui';

// Полный перечень сообщений страничного канала через границу JSON (бриф Ф6,
// раздел 1). Другого между половинами нет: ни `Caller`, ни `uuid` личности,
// ни payload события, ни следа доставки уведомления.

/** Клиент → сервер: простая команда вызова UC; `id` — для ответа `result`. */
export type CallMessage = {
  readonly kind: 'call';
  readonly id: string;
  readonly call: UcCall;
};

/** Клиент → сервер: подписка экземпляра на перечитывание по адресу. */
export type WatchMessage = {
  readonly kind: 'watch';
  readonly watch: string;
  readonly address: AddressJson;
};

/** Клиент → сервер: снять подписку `watch`. */
export type UnwatchMessage = {
  readonly kind: 'unwatch';
  readonly watch: string;
};

/** Сообщение клиента. */
export type ClientMessage = CallMessage | WatchMessage | UnwatchMessage;

/** Сервер → клиент: соединение принято; контекст рендера — один раз (Т-7). */
export type HelloMessage = {
  readonly kind: 'hello';
  readonly context: RenderContext;
};

/** Сервер → клиент: ответ на `call` с тем же `id`. */
export type ResultMessage = {
  readonly kind: 'result';
  readonly id: string;
  readonly result: SerializedResult;
};

/** Сервер → клиент: сигнал перечитывания подписки — без payload события. */
export type SignalMessage = {
  readonly kind: 'signal';
  readonly watch: string;
  readonly signal: RefreshSignal;
};

/** Сервер → клиент: подписка `watch` не принята (адрес, повтор, предел). */
export type WatchRefusedMessage = {
  readonly kind: 'watch-refused';
  readonly watch: string;
};

/** Сервер → клиент: уведомление получателю — без `trace` и `recipient`. */
export type NotificationMessage = {
  readonly kind: 'notification';
  /** `id` уведомления в графе. */
  readonly notification: string;
  readonly data: unknown;
  readonly links: readonly AddressJson[];
  /** Событие-причина: ключ отсева повтора на клиенте. */
  readonly eventId: string;
};

/** Почему сервер не принял сообщение клиента. */
export type PageRefusal = 'malformed';

/** Сервер → клиент: сообщение клиента не по схеме; соединение живо. */
export type RefusedMessage = {
  readonly kind: 'refused';
  readonly reason: PageRefusal;
};

/** Сообщение сервера. */
export type ServerMessage =
  | HelloMessage
  | ResultMessage
  | SignalMessage
  | WatchRefusedMessage
  | NotificationMessage
  | RefusedMessage;
