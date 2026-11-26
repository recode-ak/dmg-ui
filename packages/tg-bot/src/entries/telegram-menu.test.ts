import { describe, expect, test } from 'bun:test';
import { err, ok } from 'dmg-core';
import { MemoryLogger } from 'dmg-core/testing';
import { ExampleDialogUiAppDef } from 'dmg-ui/example';
import { MemoryBotApi } from '../../testing';
import { RESERVED_COMMANDS } from './telegram-entries.const';
import type { TelegramMenuSpec } from './telegram-entries.types';
import { TelegramMenu } from './telegram-menu';

// Меню команд бота: `publish` — один `setMyCommands` с командами
// из точек `menu` в порядке таблицы; `description` — название входа
// (`label` из Def приложения), область — личные чаты, `language_code` не
// задаётся. Точек `menu` нет — вызова нет (список владельца не затирается).
// Зарезервированные команды беседы (`link`, `help`, `cancel`, `back`) бот
// публикует, только если проект дал им описание (`reserved`): после команд
// точек `menu`; без описаний — как раньше (D-UI-107: `/help` по умолчанию не
// публикуется). Не бросает (ERR-01): отказ — недоставка и `warn`, бросок порта —
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
const setup = (
  entryPoints: typeof TABLE = TABLE,
  reserved?: TelegramMenuSpec['reserved'],
) => {
  const api = new MemoryBotApi();
  const logger = new MemoryLogger();
  const menu = new TelegramMenu({
    api,
    logger,
    app: ExampleDialogUiAppDef,
    entryPoints,
    ...(reserved === undefined ? {} : { reserved }),
  });
  return { api, logger, menu };
};

/** Команды единственного `setMyCommands` из журнала. */
const published = (api: MemoryBotApi) => {
  const [call] = api.journal;
  if (call?.method !== 'setMyCommands') throw new Error('меню не опубликовано');
  return call.params.commands;
};

const MENU_COMMANDS = [
  { command: 'tasks', description: 'Мои задачи' },
  { command: 'assigned', description: 'Назначенные мне' },
];

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

describe('TelegramMenu — reserved: описания зарезервированных команд', () => {
  const link = 'Ссылка на этот экран';
  const help = 'Справка по экрану';
  const cancel = 'Отменить ввод';
  const back = 'Вернуться назад';

  test('link с описанием: публикуется после команд точек menu, один setMyCommands, область — личные чаты', async () => {
    const { api, menu } = setup(TABLE, { link });

    expect(await menu.publish()).toEqual(ok());

    expect(api.journal).toHaveLength(1);
    expect(api.journal[0]).toEqual({
      method: 'setMyCommands',
      params: {
        commands: [...MENU_COMMANDS, { command: 'link', description: link }],
        scope: SCOPE,
      },
    });
  });

  test('все четыре: сначала команды точек menu, затем ровно эти четыре с описаниями проекта', async () => {
    const { api, menu } = setup(TABLE, { link, help, cancel, back });

    await menu.publish();

    const commands = published(api);
    expect(commands.slice(0, MENU_COMMANDS.length)).toEqual(MENU_COMMANDS);
    const tail = commands.slice(MENU_COMMANDS.length);
    expect(tail).toHaveLength(4);
    expect(
      Object.fromEntries(tail.map((c) => [c.command, c.description])),
    ).toEqual({ link, help, cancel, back });
  });

  test('порядок зарезервированных — по RESERVED_COMMANDS, не по порядку ключей reserved', async () => {
    const { api, menu } = setup(TABLE, { link, help, back, cancel });

    await menu.publish();

    expect(
      published(api)
        .slice(MENU_COMMANDS.length)
        .map((c) => c.command),
    ).toEqual([...RESERVED_COMMANDS]);
  });

  test('с reserved команд больше 100 — бросок сборки; ровно 100 — годится', () => {
    const points = (count: number) =>
      Array.from({ length: count }, (_, i) => ({
        entry: 'start',
        via: 'menu',
        key: `k${i}`,
      }));

    expect(() => setup(points(99), { link, help })).toThrow();
    expect(() => setup(points(98), { link, help })).not.toThrow();
  });

  test('описание только у help: публикуется одна help; остальные зарезервированные — нет', async () => {
    const { api, menu } = setup(TABLE, { help });

    await menu.publish();

    expect(published(api)).toEqual([
      ...MENU_COMMANDS,
      { command: 'help', description: help },
    ]);
  });

  test('без reserved и с пустым reserved — как раньше: только команды точек menu', async () => {
    const without = setup();
    const empty = setup(TABLE, {});

    await without.menu.publish();
    await empty.menu.publish();

    expect(published(without.api)).toEqual(MENU_COMMANDS);
    expect(published(empty.api)).toEqual(MENU_COMMANDS);
  });

  test('точек menu нет, но link описан: вызов один — только зарезервированная команда', async () => {
    const { api, menu } = setup(
      [{ entry: 'start', via: 'command', key: 'start' }],
      { link },
    );

    expect(await menu.publish()).toEqual(ok());

    expect(published(api)).toEqual([{ command: 'link', description: link }]);
  });

  test('точек menu нет и reserved нет — вызова нет, список владельца не затирается', async () => {
    const { api, menu } = setup([], {});

    await menu.publish();

    expect(api.journal).toEqual([]);
  });

  test.each([
    ['1 знак', 'я'],
    ['256 знаков', 'я'.repeat(256)],
  ])('описание %s — годится', async (_, description) => {
    const { api, menu } = setup(TABLE, { link: description });

    await menu.publish();

    expect(published(api).at(-1)).toEqual({
      command: 'link',
      description,
    });
  });

  test.each(['link', 'help', 'cancel', 'back'] as const)(
    'описание %s пустое — бросок сборки',
    (name) => {
      expect(() => setup(TABLE, { [name]: '' })).toThrow();
    },
  );

  test.each(['link', 'help', 'cancel', 'back'] as const)(
    'описание %s из 257 знаков — бросок сборки',
    (name) => {
      expect(() => setup(TABLE, { [name]: 'я'.repeat(257) })).toThrow();
    },
  );

  test('лог отказа публикации не содержит описаний зарезервированных команд (ERR-07)', async () => {
    const { api, logger, menu } = setup(TABLE, { link, help });
    api.failNext({ error_code: 400, description: 'Bad Request: wrong scope' });

    await menu.publish();

    const json = JSON.stringify(logger.records);
    expect(json).not.toContain(link);
    expect(json).not.toContain(help);
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
