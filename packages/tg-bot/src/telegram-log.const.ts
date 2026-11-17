/** Источник записей лога пакета Telegram. */
export const LOG_SOURCE = 'tg-bot';

/** Тексты записей лога: без данных собеседника. */
export const LOG_TEXTS = {
  badPeer: 'собеседник не личный чат: вызова Bot API нет',
  badCallbackData: 'callback_data длиннее предела Bot API: вызова нет',
  badHandle: 'handle сообщения не message_id',
  refused: 'Bot API отказал',
  failed: 'сбой транспорта Bot API',
  badResult: 'ответ Bot API не по схеме',
  badUpdate: 'апдейт не по схеме: сигнала нет',
  refusedUpdate: 'апдейт вне диалога: сигнала нет',
  signalFailed: 'узел бесед бросил на сигнале',
} as const;
