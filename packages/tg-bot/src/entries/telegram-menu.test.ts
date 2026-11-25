import { describe, expect, test } from 'bun:test';
import { err, ok } from 'dmg-core';
import { MemoryLogger } from 'dmg-core/testing';
import { ExampleDialogUiAppDef } from 'dmg-ui/example';
import { MemoryBotApi } from '../../testing';
import { TelegramMenu } from './telegram-menu';

// Меню команд бота: `publish` — один `setMyCommands` с командами
// из точек `menu` в порядке таблицы; `description` — название входа
// (`label` из Def приложения), область — личные чаты, `language_code` не
// задаётся. Точек `menu` нет — вызова нет (список владельца не затирается).
// Не бросает (ERR-01): отказ — недоставка и `warn`, бросок порта —
// `unavailable` и `error`; лог без данных — ни команд, ни названий (ERR-07).

const TABLE = [
  { entry: 'start', via: 'command', key: 'start' },
  { entry: 'start', via: 'menu', key: 'tasks' },
  { entry: 'assigned', via: 'menu', key: 'assigned' },
  { entry: 'assigned', via: 'link', key: 'abc' },
  { entry: 'assigned', via: 'command', key: 'mine' },
];

const SCOPE = { type: 'all_private_chats' } as const;

/** Меню на подставном порту; таблица — `TABLE`, если не задана. */
const setup = (entryPoints: typeof TABLE = TABLE) => {
  const api = new MemoryBotApi();
  const logger = new MemoryLogger();
  const menu = new TelegramMenu({
    api,
    logger,
    app: ExampleDialogUiAppDef,
    entryPoints,
  });
  return { api, logger, menu };
};

describe('TelegramMenu — publish', () => {
  test('один setMyCommands: команды точек menu по порядку таблицы, description — название входа, область — личные чаты', async () => {
    const { api, menu } = setup();

    expect(await menu.publish()).toEqual(ok());
    expect(api.journal).toEqual([
      {
        method: 'setMyCommands',
        params: {
          commands: [
            { command: 'tasks', description: 'Мои задачи' },
            { command: 'assigned', description: 'Назначенные мне' },
          ],
          scope: SCOPE,
        },
      },
    ]);
  });

  test('language_code не задаётся, точки command и link в список не входят', async () => {
    const { api, menu } = setup();

    await menu.publish();

    const [call] = api.journal;
    expect(call?.method).toBe('setMyCommands');
    expect(JSON.stringify(call?.params)).not.toContain('language_code');
    const commands = JSON.stringify(call?.params);
    for (const absent of ['"start"', '"mine"', '"abc"']) {
      expect(commands).not.toContain(absent);
    }
  });

  test('повтор ключа menu — команда один раз, первой точки', async () => {
    const { api, menu } = setup([
      { entry: 'start', via: 'menu', key: 'tasks' },
      { entry: 'assigned', via: 'menu', key: 'tasks' },
    ]);

    await menu.publish();

    expect(api.journal).toEqual([
      {
        method: 'setMyCommands',
        params: {
          commands: [{ command: 'tasks', description: 'Мои задачи' }],
          scope: SCOPE,
        },
      },
    ]);
  });

  test('точек menu нет — вызова нет, итог ok', async () => {
    const { api, menu } = setup([
      { entry: 'start', via: 'command', key: 'start' },
      { entry: 'assigned', via: 'link', key: 'abc' },
    ]);

    expect(await menu.publish()).toEqual(ok());
    expect(api.journal).toEqual([]);
  });

  test('таблица пуста — вызова нет, итог ok', async () => {
    const { api, menu } = setup([]);

    expect(await menu.publish()).toEqual(ok());
    expect(api.journal).toEqual([]);
  });

  test('повторный publish — тот же запрос', async () => {
    const { api, menu } = setup();

    await menu.publish();
    await menu.publish();

    expect(api.journal).toHaveLength(2);
    expect(api.journal[1]).toEqual(api.journal[0]);
  });
});

describe('TelegramMenu — отказы', () => {
  test('отказ 400 — недоставка rejected и warn с методом, кодом и описанием без данных', async () => {
    const { api, logger, menu } = setup();
    api.failNext({ error_code: 400, description: 'Bad Request: wrong scope' });

    expect(await menu.publish()).toEqual(err({ reason: 'rejected' }));
    expect(logger.records).toHaveLength(1);
    expect(logger.records[0]).toMatchObject({
      level: 'warn',
      source: 'tg-bot',
      meta: {
        messenger: 'telegram',
        method: 'setMyCommands',
        error_code: 400,
        description: 'Bad Request: wrong scope',
      },
    });
    const json = JSON.stringify(logger.records);
    for (const data of ['tasks', 'assigned', 'Мои задачи', 'Назначенные мне']) {
      expect(json).not.toContain(data);
    }
  });

  test('429 — unavailable', async () => {
    const { api, menu } = setup();
    api.failNext({
      error_code: 429,
      description: 'Too Many Requests: retry after 5',
      parameters: { retry_after: 5 },
    });

    expect(await menu.publish()).toEqual(err({ reason: 'unavailable' }));
    expect(api.journal).toHaveLength(1);
  });

  test('бросок порта — unavailable и error с методом и именем ошибки; publish не бросает', async () => {
    const { api, logger, menu } = setup();
    api.throwNext(new TypeError('сеть недоступна'));

    expect(await menu.publish()).toEqual(err({ reason: 'unavailable' }));
    const errors = logger.records.filter((record) => record.level === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      source: 'tg-bot',
      meta: { method: 'setMyCommands', name: 'TypeError' },
    });
    expect(JSON.stringify(logger.records)).not.toContain('сеть недоступна');
  });

  test('после отказа повторный publish шлёт тот же запрос и проходит', async () => {
    const { api, menu } = setup();
    api.failNext({ error_code: 500, description: 'Internal Server Error' });

    expect(await menu.publish()).toEqual(err({ reason: 'unavailable' }));
    expect(await menu.publish()).toEqual(ok());
    expect(api.journal[1]).toEqual(api.journal[0]);
  });
});
