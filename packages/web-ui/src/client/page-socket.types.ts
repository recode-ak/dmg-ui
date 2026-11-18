/**
 * События сокета клиента: кадр сервера (строка или двоичный — как пришёл) и
 * закрытие с кодом. За ошибкой сокета всегда следует закрытие, отдельного
 * события нет.
 */
export type PageSocketEvents = {
  message(data: unknown): void;
  closed(code: number): void;
};

/**
 * Узкий порт сокета для клиентского конца провода (D-UI-71): отправка строки,
 * закрытие, подписка на события — один раз, до первого события.
 */
export type PageSocket = {
  send(text: string): void;
  close(): void;
  listen(events: PageSocketEvents): void;
};

/**
 * Отказ соединения до `hello`: `refused` — сервер закрыл кодом отказа (пропуск
 * неизвестен, предел соединений); `closed` — иное закрытие (сервер недоступен
 * или ворота отказали — у сокета браузера это неразличимо); `malformed` —
 * первый кадр не `hello`; `timeout` — `hello` не пришёл в срок (его ставит
 * переподключатель).
 */
export type PageDialFailure = 'refused' | 'closed' | 'malformed' | 'timeout';
