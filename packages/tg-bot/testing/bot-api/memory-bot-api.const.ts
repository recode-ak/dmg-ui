/** Описания отказов и текст броска подставного порта — как у Bot API. */
export const MEMORY_BOT_API_TEXTS = {
  notFound: 'Bad Request: message to edit not found',
  notModified:
    'Bad Request: message is not modified: specified new message content and reply markup are exactly the same as a current content and reply markup of the message',
  thrown: 'сбой транспорта Bot API',
} as const;
