import { afterEach, describe, expect, test } from 'bun:test';
import { inspect } from 'node:util';
import type {
  AnswerCallbackQueryParams,
  ApproveChatJoinRequestParams,
  BanChatMemberParams,
  BotApi,
  BotApiMethod,
  EditMessageReplyMarkupParams,
  EditMessageTextParams,
  SendMessageParams,
  SetMyCommandsParams,
  UnbanChatMemberParams,
} from 'dmg-ui/tg-bot';
import { Api } from 'grammy';
import { FakeBotApiServer } from './fake-bot-api-server';
import { GrammyBotApi } from './grammy-bot-api';

// Адаптер порта на grammy проверяется на проводе: поддельный Bot API на
// loopback (`127.0.0.1`, порт назначает ОС), `Api` grammy с `apiRoot` на него.
// Подставной порт не поймал бы потерю полей при сериализации и утечку токена
// в ошибке транспорта.

const TOKEN = 'test-token';
const CHAT = 7350001234;
const SECRET_TEXT = 'секретный текст человека';

let server: FakeBotApiServer;

afterEach(async () => {
  await server.stop();
});

/** Сервер с ответчиками и адаптер на его `apiRoot`. */
const connect = (
  responders: Parameters<typeof FakeBotApiServer.start>[0] = {},
) => {
  server = FakeBotApiServer.start(responders);
  const adapter: BotApi = new GrammyBotApi(
    new Api(TOKEN, { apiRoot: server.apiRoot }),
  );
  return adapter;
};

const SEND: SendMessageParams = {
  chat_id: CHAT,
  text: 'Мои задачи\nНапоминание: 20 ноября 2026, 12:00',
  entities: [
    { type: 'bold', offset: 0, length: 10 },
    {
      type: 'date_time',
      offset: 11,
      length: 31,
      unix_time: 1_795_176_000,
      date_time_format: 'wDT',
    },
  ],
  reply_markup: {
    inline_keyboard: [
      [{ text: 'Выполнить', callback_data: 'ab12', style: 'success' }],
      [{ text: 'Открыть', callback_data: 'cd34' }],
      [{ text: 'Серая кнопка', disabled: {} }],
    ],
  },
  link_preview_options: { is_disabled: true },
};

/** Восемь методов порта: имя, вызов и параметры. */
const METHODS: readonly {
  readonly method: BotApiMethod;
  readonly params: object;
  readonly call: (api: BotApi) => Promise<unknown>;
}[] = [
  {
    method: 'sendMessage',
    params: SEND,
    call: (api) => api.sendMessage(SEND),
  },
  {
    method: 'editMessageText',
    params: {
      chat_id: CHAT,
      message_id: 5,
      text: 'Правка',
      reply_markup: { inline_keyboard: [[{ text: 'Ок', disabled: {} }]] },
    } satisfies EditMessageTextParams,
    call: (api) =>
      api.editMessageText({
        chat_id: CHAT,
        message_id: 5,
        text: 'Правка',
        reply_markup: { inline_keyboard: [[{ text: 'Ок', disabled: {} }]] },
      }),
  },
  {
    method: 'editMessageReplyMarkup',
    params: {
      chat_id: CHAT,
      message_id: 5,
      reply_markup: { inline_keyboard: [[{ text: 'Ок', disabled: {} }]] },
    } satisfies EditMessageReplyMarkupParams,
    call: (api) =>
      api.editMessageReplyMarkup({
        chat_id: CHAT,
        message_id: 5,
        reply_markup: { inline_keyboard: [[{ text: 'Ок', disabled: {} }]] },
      }),
  },
  {
    method: 'answerCallbackQuery',
    params: {
      callback_query_id: 'cq1',
      text: 'Экран уже закрыт.',
    } satisfies AnswerCallbackQueryParams,
    call: (api) =>
      api.answerCallbackQuery({
        callback_query_id: 'cq1',
        text: 'Экран уже закрыт.',
      }),
  },
  {
    method: 'setMyCommands',
    params: {
      commands: [{ command: 'start', description: 'Мои задачи' }],
      scope: { type: 'all_private_chats' },
    } satisfies SetMyCommandsParams,
    call: (api) =>
      api.setMyCommands({
        commands: [{ command: 'start', description: 'Мои задачи' }],
        scope: { type: 'all_private_chats' },
      }),
  },
  {
    method: 'banChatMember',
    params: {
      chat_id: -1001,
      user_id: 42,
      until_date: 1_795_176_300,
    } satisfies BanChatMemberParams,
    call: (api) =>
      api.banChatMember({
        chat_id: -1001,
        user_id: 42,
        until_date: 1_795_176_300,
      }),
  },
  {
    method: 'unbanChatMember',
    params: {
      chat_id: -1001,
      user_id: 42,
      only_if_banned: true,
    } satisfies UnbanChatMemberParams,
    call: (api) =>
      api.unbanChatMember({
        chat_id: -1001,
        user_id: 42,
        only_if_banned: true,
      }),
  },
  {
    method: 'approveChatJoinRequest',
    params: {
      chat_id: -1001,
      user_id: 42,
    } satisfies ApproveChatJoinRequestParams,
    call: (api) => api.approveChatJoinRequest({ chat_id: -1001, user_id: 42 }),
  },
];

describe('GrammyBotApi — тело запроса на проводе', () => {
  test('sendMessage: кнопки с цветом, отключённая кнопка, сущности date_time доходят поле в поле', async () => {
    const api = connect();
    await api.sendMessage(SEND);

    expect(server.calls).toHaveLength(1);
    expect(server.calls[0]?.body).toEqual(
      SEND as unknown as Record<string, unknown>,
    );
  });

  test('отключённая кнопка остаётся объектом disabled: {} и не получает callback_data', async () => {
    const api = connect();
    await api.sendMessage(SEND);

    const body = server.calls[0]?.body as unknown as SendMessageParams;
    const gray = body.reply_markup?.inline_keyboard[2]?.[0];
    expect(gray).toEqual({ text: 'Серая кнопка', disabled: {} });
    expect(gray).not.toHaveProperty('callback_data');
  });

  test.each(METHODS)(
    '$method уходит на /bot<токен>/<метод> без лишних полей, chat_id — числом',
    async ({ method, params, call }) => {
      const api = connect();
      await call(api);

      expect(server.calls).toHaveLength(1);
      const [sent] = server.calls;
      expect(sent?.path).toBe(`/bot${TOKEN}/${method}`);
      expect(sent?.body).toEqual(params as Record<string, unknown>);
      if ('chat_id' in params) {
        expect(typeof sent?.body.chat_id).toBe('number');
      }
    },
  );

  test('успех: порт возвращает ok и result ответа Telegram', async () => {
    const message = { message_id: 9, chat: { id: CHAT, type: 'private' } };
    const api = connect({
      sendMessage: () => FakeBotApiServer.result(message),
    });

    expect(await api.sendMessage(SEND)).toEqual({ ok: true, result: message });
  });
});

describe('GrammyBotApi — отказ Telegram как значение', () => {
  test.each([
    [400, 'Bad Request: chat not found', undefined],
    [403, 'Forbidden: bot was blocked by the user', undefined],
    [
      429,
      'Too Many Requests: retry after 7',
      { retry_after: 7 } as Record<string, number>,
    ],
    [502, 'Bad Gateway', undefined],
  ])(
    'HTTP %i: порт возвращает ok: false с кодом, описанием и parameters из ответа',
    async (code, description, parameters) => {
      const api = connect({
        sendMessage: () => ({
          status: code,
          body: {
            ok: false,
            error_code: code,
            description,
            ...(parameters ? { parameters } : {}),
          },
        }),
      });

      const outcome = await api.sendMessage(SEND);

      expect(outcome).toEqual({
        ok: false,
        error_code: code,
        description,
        ...(parameters ? { parameters } : {}),
      });
    },
  );

  test('400 с migrate_to_chat_id: новый id группы сохранён в parameters', async () => {
    const api = connect({
      sendMessage: () => ({
        status: 400,
        body: {
          ok: false,
          error_code: 400,
          description:
            'Bad Request: group chat was upgraded to a supergroup chat',
          parameters: { migrate_to_chat_id: -1001234567890 },
        },
      }),
    });

    expect(await api.sendMessage(SEND)).toEqual({
      ok: false,
      error_code: 400,
      description: 'Bad Request: group chat was upgraded to a supergroup chat',
      parameters: { migrate_to_chat_id: -1001234567890 },
    });
  });

  test('description — из JSON ответа, не из текста ошибки grammy и не из запроса человека', async () => {
    const api = connect({
      sendMessage: () => ({
        status: 400,
        body: {
          ok: false,
          error_code: 400,
          description: 'Bad Request: message is too long',
        },
      }),
    });

    const outcome = await api.sendMessage({ ...SEND, text: SECRET_TEXT });

    expect(outcome).toMatchObject({
      ok: false,
      description: 'Bad Request: message is too long',
    });
    const dump = JSON.stringify(outcome);
    expect(dump).not.toContain(SECRET_TEXT);
    expect(dump).not.toContain(TOKEN);
    expect(dump).not.toContain('Call to');
  });
});

/** Всё, что можно прочитать из ошибки: сообщение, стек, цепочка причин, JSON, inspect. */
const dumpOf = (error: unknown): string => {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; current !== undefined && depth < 10; depth += 1) {
    if (current instanceof Error) {
      parts.push(current.message, current.stack ?? '');
      parts.push(...Object.getOwnPropertyNames(current));
      current = current.cause;
    } else {
      parts.push(String(current));
      current = undefined;
    }
  }
  parts.push(JSON.stringify(error), inspect(error, { depth: 10 }));
  return parts.join('\n');
};

describe('GrammyBotApi — сбой транспорта', () => {
  const FIXED_TEXT = 'сбой транспорта Bot API';

  const failure = async (api: BotApi): Promise<Error> => {
    const outcome = await api.sendMessage({ ...SEND, text: SECRET_TEXT }).then(
      () => undefined,
      (thrown: unknown) => thrown,
    );
    expect(outcome).toBeInstanceOf(Error);
    return outcome as Error;
  };

  test('сервер закрыт: бросок с фиксированным текстом, без cause и вложенной ошибки', async () => {
    const api = connect();
    await server.stop();

    const error = await failure(api);

    expect(error.message).toBe(FIXED_TEXT);
    expect(error.cause).toBeUndefined();
    expect(Object.getOwnPropertyNames(error)).not.toContain('error');
  });

  test('сервер закрыт: ни токена, ни текста человека в message, stack, cause, JSON и inspect ошибки', async () => {
    const api = connect();
    await server.stop();

    const dump = dumpOf(await failure(api));

    expect(dump).not.toContain(TOKEN);
    expect(dump).not.toContain(SECRET_TEXT);
  });

  test('ответ не JSON (HTML от прокси): бросок очищен так же', async () => {
    const api = connect({
      sendMessage: () => ({ status: 502, raw: '<html>Bad Gateway</html>' }),
    });

    const error = await failure(api);

    expect(error.message).toBe(FIXED_TEXT);
    expect(error.cause).toBeUndefined();
    const dump = dumpOf(error);
    expect(dump).not.toContain(TOKEN);
    expect(dump).not.toContain(SECRET_TEXT);
  });
});
