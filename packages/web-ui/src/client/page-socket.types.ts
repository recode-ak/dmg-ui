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
