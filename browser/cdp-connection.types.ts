/** Сообщение DevTools от браузера: ответ на запрос (`id`) или событие (`method`). */
export type CdpMessage = {
  readonly id?: number;
  readonly result?: unknown;
  readonly error?: { readonly code: number; readonly message: string };
  readonly method?: string;
  readonly params?: unknown;
  readonly sessionId?: string;
};

/** Ожидающий ответа запрос: `method` нужен для сообщения об ошибке. */
export type CdpPending = {
  readonly method: string;
  readonly resolve: (result: unknown) => void;
  readonly reject: (error: Error) => void;
};

/** Ожидающий событие: имя, сессия (`undefined` — событие самого браузера) и концы промиса. */
export type CdpListener = {
  readonly event: string;
  readonly sessionId: string | undefined;
  readonly resolve: (params: unknown) => void;
  readonly reject: (error: Error) => void;
};
