import { afterEach, describe, expect, test } from 'bun:test';
import { AwaitingBus, MemoryLogger, useTempDir } from 'dmg-core/testing';
import { ExampleDialogAppDef } from 'dmg-ui/chat-ui/testing';
import { TaskAssignedNotificationDef } from 'dmg-ui/testing';
import { MemoryBotApi, TestUpdates } from 'dmg-ui/tg-bot/testing';
import { ExampleBot } from './example-bot';
import { ENTRY_POINTS, EXAMPLE_USER_B } from './example-bot.const';

// Сборка примера на подставном порту: без токена, без сети, без grammy
// (`grammy` в `example-bot.ts` запрещает `ExampleZoneScanner`). Проверяется
// код `ExampleBot` — личность, меню, уведомления, перезапуск, границы приёма;
// тексты экранов, лимиты и сущности остаются на уровне пакета (TST-08).

/** id Telegram: допущенные A и B, чужой, id самого бота; группа — отрицательный. */
const A = 7350001234;
const B = 7350005678;
const STRANGER = 7350006666;
/** Совпадает с id бота в апдейтах `TestUpdates` (`my_chat_member`). */
const BOT = 7350007777;
const GROUP = -1001234567890;

const tmp = useTempDir('example-bot-');

const launched: ExampleBot[] = [];

afterEach(async () => {
  for (const bot of launched.splice(0)) await bot.close();
});

/** Узел примера на подставном порту; `start()` вызван, как при запуске. */
const world = async () => {
  const api = new MemoryBotApi();
  const logger = new MemoryLogger();
  const updates = new TestUpdates();

  /** Новый узел на том же порту и каталоге данных: «перезапуск» — хранилище бесед новое. */
  const launch = async () => {
    const bus = new AwaitingBus();
    const bot = new ExampleBot({
      api,
      bot: BOT,
      users: [A, B],
      logger,
      bus,
      dataDir: tmp().path,
    });
    launched.push(bot);
    await bot.start();
    return {
      bot,
      settle: async () => {
        await bus.delivered();
        await bot.settled();
      },
    };
  };

  /** Последнее сообщение чата с нажимаемой кнопкой. */
  const place = (chat: number) => {
    const line = api
      .chat(chat)
      .findLast((candidate) =>
        candidate.keyboard.flat().some((button) => 'callback_data' in button),
      );
    if (line === undefined) throw new Error('живого места нет');
    return line;
  };

  /** Кнопка живого места по подписи: её данные и сообщение. */
  const find = (chat: number, label: string) => {
    const line = place(chat);
    const button = line.keyboard
      .flat()
      .find((candidate) => candidate.text === label);
    if (button === undefined || !('callback_data' in button)) {
      throw new Error(`нет кнопки «${label}»`);
    }
    return { data: button.callback_data, messageId: line.message_id };
  };

  const sendMessages = (chat: number) =>
    api.journal.flatMap((call) =>
      call.method === 'sendMessage' && call.params.chat_id === chat
        ? [call.params]
        : [],
    );

  const answers = () =>
    api.journal.flatMap((call) =>
      call.method === 'answerCallbackQuery' ? [call.params] : [],
    );

  return { api, logger, updates, launch, place, find, sendMessages, answers };
};

describe('ExampleBot — вход допущенного человека', () => {
  test('/start от A: сообщение в чат A со списком «Мои задачи» и кнопками', async () => {
    const w = await world();
    const { bot } = await w.launch();

    await bot.receive(w.updates.text(A, '/start'));

    const sent = w.sendMessages(A);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.text.split('\n')[0]).toBe('Мои задачи');
    const labels = sent[0]?.reply_markup?.inline_keyboard
      .flat()
      .map((button) => button.text);
    expect(labels).toEqual(['Создать задачу', 'Закрыть']);
    expect(w.sendMessages(B)).toEqual([]);
  });

  test('ссылка t.me/<бот>?start=<ключ>: тот же вход, что и /start', async () => {
    const w = await world();
    const { bot } = await w.launch();
    const link = ENTRY_POINTS.find((point) => point.via === 'link');

    await bot.receive(w.updates.text(A, `/start ${link?.key}`));

    expect(link?.entry).toBe('start');
    expect(w.sendMessages(A)).toHaveLength(1);
    expect(w.sendMessages(A)[0]?.text.split('\n')[0]).toBe('Мои задачи');
  });
});

describe('ExampleBot — чужой человек', () => {
  test('/start от аккаунта вне списка: ни одного sendMessage, одна запись warn без id', async () => {
    const w = await world();
    const { bot } = await w.launch();

    await bot.receive(w.updates.text(STRANGER, '/start'));

    expect(w.sendMessages(STRANGER)).toEqual([]);
    expect(
      w.api.journal.filter((call) => call.method === 'sendMessage'),
    ).toEqual([]);
    expect(
      w.logger.records.filter((record) => record.level === 'warn'),
    ).toHaveLength(1);
    const dump = JSON.stringify(w.logger.records);
    expect(dump).not.toContain(String(STRANGER));
    expect(dump).not.toContain(String(A));
  });

  test('нажатие чужого на кнопку A: ответ на нажатие без текста, экран A не тронут', async () => {
    const w = await world();
    const { bot } = await w.launch();
    await bot.receive(w.updates.text(A, '/start'));
    const { data, messageId } = w.find(A, 'Создать задачу');
    const before = w.api.chat(A);

    const press = w.updates.press(STRANGER, data, messageId);
    await bot.receive(press);

    expect(w.answers()).toEqual([
      { callback_query_id: press.callback_query.id },
    ]);
    expect(
      w.api.journal.filter((call) => call.method === 'editMessageText'),
    ).toEqual([]);
    expect(w.api.chat(A)).toEqual(before);
    expect(w.sendMessages(A)).toHaveLength(1);
  });
});

describe('ExampleBot — меню и уведомления', () => {
  test('start(): один setMyCommands с командами точек menu из ENTRY_POINTS, область — личные чаты', async () => {
    const w = await world();

    await w.launch();

    const published = w.api.journal.filter(
      (call) => call.method === 'setMyCommands',
    );
    expect(published).toHaveLength(1);
    const expected = ENTRY_POINTS.filter((point) => point.via === 'menu').map(
      (point) => ({
        command: point.key,
        description: ExampleDialogAppDef.entries[point.entry]?.label,
      }),
    );
    expect(expected.length).toBeGreaterThan(0);
    expect(published[0]?.params).toEqual({
      commands: expected,
      scope: { type: 'all_private_chats' },
    });
  });

  test('назначение задачи B: уведомление «Поручение» доходит в чат B с кнопкой «Назначенные мне»', async () => {
    const w = await world();
    const { bot, settle } = await w.launch();
    const press = async (label: string) => {
      const { data, messageId } = w.find(A, label);
      await bot.receive(w.updates.press(A, data, messageId));
    };

    await bot.receive(w.updates.text(A, '/start'));
    await bot.receive(w.updates.text(A, 'Хлеб'));
    await settle();
    await press('Открыть задачу');
    await press('Хлеб');
    await press('Назначить');
    await bot.receive(w.updates.text(A, EXAMPLE_USER_B));
    await settle();

    const [notice] = w.sendMessages(B);
    expect(w.sendMessages(B)).toHaveLength(1);
    expect(notice?.text).toBe(`${TaskAssignedNotificationDef.label}: Хлеб`);
    expect(notice?.reply_markup?.inline_keyboard).toEqual([
      [{ text: 'Назначенные мне', callback_data: expect.any(String) }],
    ]);
  });
});

describe('ExampleBot — перезапуск на новом хранилище бесед', () => {
  test('нажатие по старой ссылке получает ровно один ответ, узел не падает, новый /start даёт экран', async () => {
    const w = await world();
    const first = await w.launch();
    await first.bot.receive(w.updates.text(A, '/start'));
    const { data, messageId } = w.find(A, 'Создать задачу');
    await first.bot.close();
    launched.splice(launched.indexOf(first.bot), 1);

    const second = await w.launch();
    const press = w.updates.press(A, data, messageId);
    await second.bot.receive(press);

    expect(
      w
        .answers()
        .filter((a) => a.callback_query_id === press.callback_query.id),
    ).toHaveLength(1);
    expect(w.logger.records.filter((r) => r.level === 'error')).toEqual([]);

    await second.bot.receive(w.updates.text(A, '/start'));
    expect(w.sendMessages(A)).toHaveLength(2);
    expect(w.sendMessages(A)[1]?.text.split('\n')[0]).toBe('Мои задачи');
  });
});

describe('ExampleBot — границы приёма', () => {
  test('текст в группе (chat_id < 0): тишина, сообщений нет, узел не падает', async () => {
    const w = await world();
    const { bot } = await w.launch();

    await bot.receive(w.updates.groupText(GROUP, A, '/start'));

    expect(
      w.api.journal.filter((call) => call.method !== 'setMyCommands'),
    ).toEqual([]);
    expect(w.logger.records.filter((r) => r.level === 'error')).toEqual([]);
  });

  test('события группы без сообщества — тишина: бот добавлен, вход, выход, заявка', async () => {
    const w = await world();
    const { bot } = await w.launch();

    await bot.receive(w.updates.botAdded(GROUP, A));
    await bot.receive(w.updates.joined(GROUP, B, B));
    await bot.receive(w.updates.left(GROUP, B, B));
    await bot.receive(w.updates.joinRequest(GROUP, B));

    expect(
      w.api.journal.filter((call) => call.method !== 'setMyCommands'),
    ).toEqual([]);
    expect(w.logger.records.filter((r) => r.level === 'error')).toEqual([]);
  });

  test('receive не бросает на мусорном апдейте и ничего не отправляет', async () => {
    const w = await world();
    const { bot } = await w.launch();
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const hostile = {
      get message(): never {
        throw new Error('чужой геттер');
      },
    };
    const garbage: unknown[] = [
      undefined,
      null,
      42,
      'строка',
      [],
      {},
      { update_id: 1 },
      { update_id: 1, message: 5 },
      { update_id: 1, message: { text: '/start' } },
      { update_id: 1, callback_query: { id: 'x' } },
      circular,
      hostile,
    ];

    for (const update of garbage) {
      await expect(bot.receive(update)).resolves.toBeUndefined();
    }

    expect(
      w.api.journal.filter(
        (call) =>
          call.method !== 'setMyCommands' &&
          call.method !== 'answerCallbackQuery',
      ),
    ).toEqual([]);
  });
});
