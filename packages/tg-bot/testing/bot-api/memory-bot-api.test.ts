import { describe, expect, test } from 'bun:test';
import { MemoryBotApi } from '..';

// Контракт подставного порта Bot API: журнал вызовов как есть, `message_id`
// растёт в каждом чате, правка неизвестного и правка тем же содержимым
// отвечают отказом, как Bot API; `failNext` и `throwNext` действуют на один
// следующий вызов. `chat` — сообщения чата глазами собеседника: текст,
// сущности, клавиатура и число правок.

const CHAT = 10;
const OTHER = 20;
const BOLD = [{ type: 'bold', offset: 0, length: 6 }] as const;
const KEYBOARD = {
  inline_keyboard: [[{ text: 'Дальше', callback_data: 'r1' }]],
};

describe('MemoryBotApi — отправка', () => {
  test('message_id растёт в каждом чате отдельно, ответ — ok с message_id', async () => {
    const api = new MemoryBotApi();

    const first = await api.sendMessage({ chat_id: CHAT, text: 'один' });
    const second = await api.sendMessage({ chat_id: CHAT, text: 'два' });
    const other = await api.sendMessage({ chat_id: OTHER, text: 'три' });

    expect(first).toMatchObject({ ok: true, result: { message_id: 1 } });
    expect(second).toMatchObject({ ok: true, result: { message_id: 2 } });
    expect(other).toMatchObject({ ok: true, result: { message_id: 1 } });
  });

  test('журнал — метод и параметры как есть, по порядку вызовов', async () => {
    const api = new MemoryBotApi();
    const send = {
      chat_id: CHAT,
      text: 'Привет',
      entities: [...BOLD],
      reply_markup: KEYBOARD,
      link_preview_options: { is_disabled: true },
    };

    await api.sendMessage(send);
    await api.answerCallbackQuery({ callback_query_id: 'q1', text: 'Ок' });

    expect(api.journal).toEqual([
      { method: 'sendMessage', params: send },
      {
        method: 'answerCallbackQuery',
        params: { callback_query_id: 'q1', text: 'Ок' },
      },
    ]);
  });

  test('answerCallbackQuery — ok', async () => {
    const api = new MemoryBotApi();

    expect(
      await api.answerCallbackQuery({ callback_query_id: 'q1' }),
    ).toMatchObject({ ok: true });
  });
});

describe('MemoryBotApi — правка', () => {
  test('editMessageText показанного — ok, текст, сущности и клавиатура новые, правка посчитана', async () => {
    const api = new MemoryBotApi();
    await api.sendMessage({ chat_id: CHAT, text: 'Привет' });

    const edited = await api.editMessageText({
      chat_id: CHAT,
      message_id: 1,
      text: 'Привет',
      entities: [...BOLD],
      reply_markup: KEYBOARD,
    });

    expect(edited).toMatchObject({ ok: true });
    expect(api.chat(CHAT)).toEqual([
      {
        message_id: 1,
        text: 'Привет',
        entities: [...BOLD],
        keyboard: KEYBOARD.inline_keyboard,
        edits: 1,
      },
    ]);
  });

  test('правка неизвестного message_id — 400 «message to edit not found», у обоих методов правки', async () => {
    const api = new MemoryBotApi();
    await api.sendMessage({ chat_id: CHAT, text: 'Привет' });

    const text = await api.editMessageText({
      chat_id: CHAT,
      message_id: 99,
      text: 'Пока',
    });
    const markup = await api.editMessageReplyMarkup({
      chat_id: CHAT,
      message_id: 99,
    });

    for (const result of [text, markup]) {
      expect(result).toMatchObject({ ok: false, error_code: 400 });
      expect(result.ok === false && result.description).toContain(
        'message to edit not found',
      );
    }
  });

  test('правка сообщения другого чата по его message_id — 400 «message to edit not found»', async () => {
    const api = new MemoryBotApi();
    await api.sendMessage({ chat_id: CHAT, text: 'Привет' });

    const result = await api.editMessageText({
      chat_id: OTHER,
      message_id: 1,
      text: 'Пока',
    });

    expect(result).toMatchObject({ ok: false, error_code: 400 });
    expect(result.ok === false && result.description).toContain(
      'message to edit not found',
    );
  });

  test('editMessageText тем же текстом, сущностями и клавиатурой — 400 «message is not modified», правки нет', async () => {
    const api = new MemoryBotApi();
    const same = {
      chat_id: CHAT,
      text: 'Привет',
      entities: [...BOLD],
      reply_markup: KEYBOARD,
    };
    await api.sendMessage(same);

    const result = await api.editMessageText({ ...same, message_id: 1 });

    expect(result).toMatchObject({ ok: false, error_code: 400 });
    expect(result.ok === false && result.description).toContain(
      'message is not modified',
    );
    expect(api.chat(CHAT)[0]?.edits).toBe(0);
  });

  test('тот же текст с другими сущностями — правка, не отказ', async () => {
    const api = new MemoryBotApi();
    await api.sendMessage({ chat_id: CHAT, text: 'Привет' });

    const result = await api.editMessageText({
      chat_id: CHAT,
      message_id: 1,
      text: 'Привет',
      entities: [...BOLD],
    });

    expect(result).toMatchObject({ ok: true });
  });

  test('editMessageReplyMarkup без разметки снимает клавиатуру; повтор — 400 «message is not modified»', async () => {
    const api = new MemoryBotApi();
    await api.sendMessage({
      chat_id: CHAT,
      text: 'Привет',
      reply_markup: KEYBOARD,
    });

    const removed = await api.editMessageReplyMarkup({
      chat_id: CHAT,
      message_id: 1,
    });
    const again = await api.editMessageReplyMarkup({
      chat_id: CHAT,
      message_id: 1,
    });

    expect(removed).toMatchObject({ ok: true });
    expect(again).toMatchObject({ ok: false, error_code: 400 });
    expect(again.ok === false && again.description).toContain(
      'message is not modified',
    );
    expect(api.chat(CHAT)).toEqual([
      { message_id: 1, text: 'Привет', entities: [], keyboard: [], edits: 1 },
    ]);
  });

  test('editMessageText без reply_markup снимает клавиатуру, как Bot API', async () => {
    const api = new MemoryBotApi();
    await api.sendMessage({
      chat_id: CHAT,
      text: 'Привет',
      reply_markup: KEYBOARD,
    });

    await api.editMessageText({ chat_id: CHAT, message_id: 1, text: 'Пока' });

    expect(api.chat(CHAT)[0]).toMatchObject({ text: 'Пока', keyboard: [] });
  });
});

describe('MemoryBotApi — заданные сбои', () => {
  test('failNext — следующий вызов получает этот отказ, вызов после него — обычный', async () => {
    const api = new MemoryBotApi();
    api.failNext({
      error_code: 429,
      description: 'Too Many Requests: retry after 5',
      parameters: { retry_after: 5 },
    });

    const failed = await api.sendMessage({ chat_id: CHAT, text: 'один' });
    const sent = await api.sendMessage({ chat_id: CHAT, text: 'два' });

    expect(failed).toEqual({
      ok: false,
      error_code: 429,
      description: 'Too Many Requests: retry after 5',
      parameters: { retry_after: 5 },
    });
    expect(sent).toMatchObject({ ok: true, result: { message_id: 1 } });
  });

  test('failNext — вызов в журнале есть, в чате сообщения нет', async () => {
    const api = new MemoryBotApi();
    api.failNext({
      error_code: 403,
      description: 'Forbidden: bot was blocked',
    });

    await api.sendMessage({ chat_id: CHAT, text: 'один' });

    expect(api.journal.map((call) => call.method)).toEqual(['sendMessage']);
    expect(api.chat(CHAT)).toEqual([]);
  });

  test('failNext действует и на answerCallbackQuery', async () => {
    const api = new MemoryBotApi();
    api.failNext({
      error_code: 400,
      description: 'Bad Request: query is too old',
    });

    expect(
      await api.answerCallbackQuery({ callback_query_id: 'q1' }),
    ).toMatchObject({ ok: false, error_code: 400 });
  });

  test('throwNext — следующий вызов бросает, вызов после него — обычный', async () => {
    const api = new MemoryBotApi();
    api.throwNext();

    await expect(
      api.sendMessage({ chat_id: CHAT, text: 'один' }),
    ).rejects.toBeInstanceOf(Error);
    expect(await api.sendMessage({ chat_id: CHAT, text: 'два' })).toMatchObject(
      { ok: true, result: { message_id: 1 } },
    );
  });

  test('throwNext с ошибкой — бросает именно её', async () => {
    const api = new MemoryBotApi();
    const failure = new TypeError('сеть недоступна');
    api.throwNext(failure);

    await expect(
      api.editMessageText({ chat_id: CHAT, message_id: 1, text: 'х' }),
    ).rejects.toBe(failure);
  });
});

describe('MemoryBotApi — чат глазами собеседника', () => {
  test('строка на каждое отправленное сообщение по порядку: текст, сущности, клавиатура, число правок', async () => {
    const api = new MemoryBotApi();
    await api.sendMessage({
      chat_id: CHAT,
      text: 'Привет',
      entities: [...BOLD],
      reply_markup: KEYBOARD,
    });
    await api.sendMessage({ chat_id: CHAT, text: 'Второе' });
    await api.sendMessage({ chat_id: OTHER, text: 'Чужое' });
    await api.editMessageText({ chat_id: CHAT, message_id: 2, text: 'Ещё' });
    await api.editMessageText({ chat_id: CHAT, message_id: 2, text: 'Снова' });

    expect(api.chat(CHAT)).toEqual([
      {
        message_id: 1,
        text: 'Привет',
        entities: [...BOLD],
        keyboard: KEYBOARD.inline_keyboard,
        edits: 0,
      },
      { message_id: 2, text: 'Снова', entities: [], keyboard: [], edits: 2 },
    ]);
    expect(api.chat(OTHER)).toEqual([
      { message_id: 1, text: 'Чужое', entities: [], keyboard: [], edits: 0 },
    ]);
  });

  test('отказ правки чат не меняет', async () => {
    const api = new MemoryBotApi();
    await api.sendMessage({ chat_id: CHAT, text: 'Привет' });
    api.failNext({ error_code: 500, description: 'Internal Server Error' });

    await api.editMessageText({ chat_id: CHAT, message_id: 1, text: 'Пока' });

    expect(api.chat(CHAT)).toEqual([
      { message_id: 1, text: 'Привет', entities: [], keyboard: [], edits: 0 },
    ]);
  });

  test('чат без сообщений — пусто', () => {
    expect(new MemoryBotApi().chat(CHAT)).toEqual([]);
  });
});

describe('MemoryBotApi — меню команд', () => {
  const PARAMS = {
    commands: [{ command: 'tasks', description: 'Мои задачи' }],
    scope: { type: 'all_private_chats' },
  };

  test('setMyCommands — ok с result true, журнал — метод и параметры как есть', async () => {
    const api = new MemoryBotApi();

    expect(await api.setMyCommands(PARAMS)).toEqual({ ok: true, result: true });
    expect(api.journal).toEqual([{ method: 'setMyCommands', params: PARAMS }]);
  });

  test('повторный setMyCommands тем же списком — снова ok: модели меню у подставного порта нет', async () => {
    const api = new MemoryBotApi();

    await api.setMyCommands(PARAMS);

    expect(await api.setMyCommands(PARAMS)).toEqual({ ok: true, result: true });
    expect(api.journal).toHaveLength(2);
  });

  test('failNext бьёт и по setMyCommands: вызов в журнале, следующий — обычный', async () => {
    const api = new MemoryBotApi();
    api.failNext({ error_code: 400, description: 'Bad Request: x' });

    expect(await api.setMyCommands(PARAMS)).toEqual({
      ok: false,
      error_code: 400,
      description: 'Bad Request: x',
    });
    expect(await api.setMyCommands(PARAMS)).toEqual({ ok: true, result: true });
    expect(api.journal.map((call) => call.method)).toEqual([
      'setMyCommands',
      'setMyCommands',
    ]);
  });

  test('throwNext бросает и на setMyCommands', async () => {
    const api = new MemoryBotApi();
    api.throwNext(new TypeError('сеть'));

    await expect(api.setMyCommands(PARAMS)).rejects.toThrow(TypeError);
    expect(api.journal).toHaveLength(1);
  });

  test('setMyCommands чат не создаёт: чаты и message_id нетронуты', async () => {
    const api = new MemoryBotApi();

    await api.setMyCommands(PARAMS);
    const sent = await api.sendMessage({ chat_id: CHAT, text: 'один' });

    expect(sent).toMatchObject({ ok: true, result: { message_id: 1 } });
    expect(api.chat(CHAT)).toHaveLength(1);
  });
});

// Операции группы: журнал как есть, ответ ok с result true, модели
// членства нет (TST-09). `failOn(method, failure)` — отказ на один следующий
// вызов именно этого метода, `holdOn(method)` — один следующий вызов метода
// ждёт `release` (без таймеров): так тест ставит очередь сообщества.

const GROUP = -1004001234567;
const MEMBER = 7350001234;
const BAN = { chat_id: GROUP, user_id: MEMBER, until_date: 1_700_000_060 };
const UNBAN = { chat_id: GROUP, user_id: MEMBER, only_if_banned: true };
const APPROVE = { chat_id: GROUP, user_id: MEMBER };

/** Ждёт условия микрозадачами, без таймеров; не наступило — тест падает явно. */
const until = async (condition: () => boolean): Promise<void> => {
  for (let turn = 0; turn < 1000; turn += 1) {
    if (condition()) return;
    await Promise.resolve();
  }
  throw new Error('условие не наступило');
};

describe('MemoryBotApi — операции группы', () => {
  test('banChatMember, unbanChatMember, approveChatJoinRequest — ok с result true, журнал — метод и параметры как есть', async () => {
    const api = new MemoryBotApi();

    expect(await api.banChatMember(BAN)).toEqual({ ok: true, result: true });
    expect(await api.unbanChatMember(UNBAN)).toEqual({
      ok: true,
      result: true,
    });
    expect(await api.approveChatJoinRequest(APPROVE)).toEqual({
      ok: true,
      result: true,
    });
    expect(api.journal).toEqual([
      { method: 'banChatMember', params: BAN },
      { method: 'unbanChatMember', params: UNBAN },
      { method: 'approveChatJoinRequest', params: APPROVE },
    ]);
  });

  test('операции группы чат не создают и message_id не трогают', async () => {
    const api = new MemoryBotApi();

    await api.banChatMember(BAN);
    const sent = await api.sendMessage({ chat_id: GROUP, text: 'один' });

    expect(sent).toMatchObject({ ok: true, result: { message_id: 1 } });
  });

  test('повторный ban того же участника — снова ok: модели членства у подставного порта нет', async () => {
    const api = new MemoryBotApi();

    await api.banChatMember(BAN);

    expect(await api.banChatMember(BAN)).toEqual({ ok: true, result: true });
    expect(api.journal).toHaveLength(2);
  });
});

describe('MemoryBotApi — failOn', () => {
  const FAILURE = { error_code: 400, description: 'Bad Request: x' };

  test('failOn(method) бьёт по следующему вызову этого метода; вызов в журнале, следующий вызов — обычный', async () => {
    const api = new MemoryBotApi();
    api.failOn('unbanChatMember', FAILURE);

    expect(await api.unbanChatMember(UNBAN)).toEqual({ ok: false, ...FAILURE });
    expect(await api.unbanChatMember(UNBAN)).toEqual({
      ok: true,
      result: true,
    });
    expect(api.journal.map((call) => call.method)).toEqual([
      'unbanChatMember',
      'unbanChatMember',
    ]);
  });

  test('failOn бьёт только по своему методу: вызовы других проходят и отказ не расходуют', async () => {
    const api = new MemoryBotApi();
    api.failOn('unbanChatMember', FAILURE);

    expect(await api.banChatMember(BAN)).toEqual({ ok: true, result: true });
    expect(
      await api.sendMessage({ chat_id: MEMBER, text: 'один' }),
    ).toMatchObject({ ok: true });
    expect(await api.unbanChatMember(UNBAN)).toEqual({ ok: false, ...FAILURE });
  });

  test('failOn с retry_after и migrate_to_chat_id — параметры в ответе как есть', async () => {
    const api = new MemoryBotApi();
    api.failOn('banChatMember', {
      error_code: 400,
      description: 'Bad Request: group chat was upgraded to a supergroup chat',
      parameters: { migrate_to_chat_id: -1009990001111 },
    });

    expect(await api.banChatMember(BAN)).toEqual({
      ok: false,
      error_code: 400,
      description: 'Bad Request: group chat was upgraded to a supergroup chat',
      parameters: { migrate_to_chat_id: -1009990001111 },
    });
  });

  test('failNext и throwNext — прежние: бьют по следующему вызову любого метода группы', async () => {
    const api = new MemoryBotApi();
    api.failNext(FAILURE);
    expect(await api.approveChatJoinRequest(APPROVE)).toEqual({
      ok: false,
      ...FAILURE,
    });
    api.throwNext(new TypeError('сеть'));
    await expect(api.banChatMember(BAN)).rejects.toThrow(TypeError);
    expect(api.journal.map((call) => call.method)).toEqual([
      'approveChatJoinRequest',
      'banChatMember',
    ]);
  });
});

describe('MemoryBotApi — holdOn', () => {
  test('holdOn держит вызов до release: вызов уже в журнале, ответа нет; после release — обычный ответ', async () => {
    const api = new MemoryBotApi();
    const release = api.holdOn('banChatMember');
    let answered = false;

    const call = api.banChatMember(BAN).then((answer) => {
      answered = true;
      return answer;
    });
    await until(() => api.journal.length === 1);
    for (let turn = 0; turn < 50; turn += 1) await Promise.resolve();

    expect(answered).toBe(false);
    release();
    expect(await call).toEqual({ ok: true, result: true });
  });

  test('holdOn держит только свой метод и только один следующий вызов', async () => {
    const api = new MemoryBotApi();
    const release = api.holdOn('banChatMember');

    const held = api.banChatMember(BAN);
    await until(() => api.journal.length === 1);
    expect(await api.unbanChatMember(UNBAN)).toEqual({
      ok: true,
      result: true,
    });
    release();
    await held;

    expect(await api.banChatMember(BAN)).toEqual({ ok: true, result: true });
    expect(api.journal.map((call) => call.method)).toEqual([
      'banChatMember',
      'unbanChatMember',
      'banChatMember',
    ]);
  });

  test('holdOn и failOn на один метод — после release вызов получает отказ', async () => {
    const api = new MemoryBotApi();
    api.failOn('banChatMember', { error_code: 403, description: 'Forbidden' });
    const release = api.holdOn('banChatMember');

    const held = api.banChatMember(BAN);
    await until(() => api.journal.length === 1);
    release();

    expect(await held).toEqual({
      ok: false,
      error_code: 403,
      description: 'Forbidden',
    });
  });
});
