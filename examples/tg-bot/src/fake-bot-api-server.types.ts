/** Вызов поддельного Bot API: метод, путь запроса и тело JSON как пришло. */
export type FakeBotApiCall = {
  readonly method: string;
  readonly path: string;
  readonly body: Record<string, unknown>;
};

/** Ответ поддельного Bot API: статус HTTP и тело (JSON или сырой текст). */
export type FakeBotApiReply = {
  readonly status?: number;
  readonly body?: unknown;
  readonly raw?: string;
};

/**
 * Ответчик метода. `signal` — отмена запроса клиентом: долгий опрос ждёт её,
 * а не таймера.
 */
export type FakeBotApiResponder = (
  call: FakeBotApiCall,
  signal: AbortSignal,
) => FakeBotApiReply | Promise<FakeBotApiReply>;
