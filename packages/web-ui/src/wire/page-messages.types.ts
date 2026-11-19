import type { SerializedResult } from 'dmg-core';
import type { AddressJson, RefreshSignal, UcCall, ViewContext } from 'dmg-ui';

// Полный перечень сообщений страничного канала через границу JSON. Другого между половинами нет: ни `Caller`,
// ни payload события, ни следа доставки уведомления; `uuid` личности — только внутри `hello.context.subject`,
// если проект его переводит (D-UI-99).

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

/**
 * Сервер → клиент: соединение принято; контекст рендера — один раз
 * (D-UI-33). `subject` — JSON из `subjectToWire` проекта, не объект субъекта.
 */
export type HelloMessage = {
  readonly kind: 'hello';
  readonly context: HelloContext;
};

/**
 * Контекст `hello` на проводе (D-UI-99): контекст вида и субъект в форме
 * JSON проекта; объектом субъекта он становится только после `reviveSubject`.
 */
export type HelloContext = ViewContext & {
  readonly subject?: unknown;
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

/** Почему сервер не принял строку клиента: не по схеме или длиннее предела. */
export type PageRefusal = 'malformed' | 'too-large';

/** Сервер → клиент: строка клиента не принята; соединение живо. */
export type RefusedMessage = {
  readonly kind: 'refused';
  readonly reason: PageRefusal;
  /** `id` вызова, если конверт `call` разобрался: клиент отказывает этот вызов. */
  readonly id?: string;
};

/** Сообщение сервера. */
export type ServerMessage =
  | HelloMessage
  | ResultMessage
  | SignalMessage
  | WatchRefusedMessage
  | NotificationMessage
  | RefusedMessage;
