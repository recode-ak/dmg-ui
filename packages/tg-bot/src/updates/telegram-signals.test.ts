import { describe, expect, test } from 'bun:test';
import type { AttachmentKind, CommunitySignalKind } from 'dmg-ui/chat-ui';
import { TelegramSignals } from './telegram-signals';
import { TELEGRAM_ALLOWED_UPDATES } from './telegram-updates.const';

// Перевод апдейта Bot API в сигнал беседы — чистый, без порта и лога:
// сигнал, отказ с причиной (у нажатия — с его id: ответ обязателен) или
// «ничего» без записи. Диалог — только личный чат, где отправитель и
// собеседник — один человек. Апдейты — JSON Bot API как есть.

const ME = 7350001234;
const OTHER = 7350009999;
const HEAD = { id: '101', peer: String(ME), sender: String(ME) };

const user = (id = ME) => ({ id, is_bot: false, first_name: 'Нурлан' });
const privateChat = (id = ME) => ({
  id,
  type: 'private',
  first_name: 'Нурлан',
});
const group = { id: -4001234567, type: 'group', title: 'Группа' };
const supergroup = {
  id: -1004001234567,
  type: 'supergroup',
  title: 'Супергруппа',
};
const channel = { id: -1004007654321, type: 'channel', title: 'Канал' };

/** Сообщение личного чата с полями `fields`; чат и отправитель — по умолчанию свои. */
const message = (
  fields: Record<string, unknown>,
  chat: Record<string, unknown> = privateChat(),
  from: unknown = user(),
) => ({
  update_id: 101,
  message: { message_id: 5, date: 1_700_000_000, chat, from, ...fields },
});

/** Текст с сущностью `bot_command` на первое слово. */
const command = (text: string) =>
  message({
    text,
    entities: [
      { type: 'bot_command', offset: 0, length: text.split(' ')[0]?.length },
    ],
  });

/** Нажатие кнопки на сообщении личного чата; поля `fields` заменяют свои. */
const press = (fields: Record<string, unknown> = {}) => ({
  update_id: 102,
  callback_query: {
    id: 'cq-7',
    from: user(),
    chat_instance: '-5550001',
    message: { message_id: 5, date: 1_700_000_000, chat: privateChat() },
    data: 'r1',
    ...fields,
  },
});

/** Нажатие без поля `key` и с полями `fields`. */
const pressWithout = (key: string, fields: Record<string, unknown>) => ({
  update_id: 102,
  callback_query: Object.fromEntries(
    Object.entries({ ...press().callback_query, ...fields }).filter(
      ([name]) => name !== key,
    ),
  ),
});

const file = (id: string) => ({ file_id: id, file_unique_id: `u-${id}` });

/** Перевод с таблицей `/start` — для сценариев, где точки входа не важны. */
const signals = new TelegramSignals({
  entryPoints: [{ entry: 'start', via: 'command', key: 'start' }],
  bot: 7350007777,
});
const signal = (update: unknown) => signals.of(update);

describe('TelegramSignals — текст и команды', () => {
  test('личный текст → text: id — update_id, peer — chat.id, sender — from.id', () => {
    expect(signal(message({ text: 'Хлеб' }))).toEqual({
      kind: 'signal',
      signal: { ...HEAD, kind: 'text', text: 'Хлеб' },
    });
  });

  test('/cancel → cancel, /back → back', () => {
    expect(signal(command('/cancel'))).toEqual({
      kind: 'signal',
      signal: { ...HEAD, kind: 'cancel' },
    });
    expect(signal(command('/back@example_bot'))).toEqual({
      kind: 'signal',
      signal: { ...HEAD, kind: 'back' },
    });
  });

  test('текст с / без сущности bot_command — обычный текст', () => {
    expect(signal(message({ text: '/start' }))).toEqual({
      kind: 'signal',
      signal: { ...HEAD, kind: 'text', text: '/start' },
    });
  });

  test('bot_command не в начале текста — обычный текст', () => {
    const text = 'жми /start';
    const update = message({
      text,
      entities: [{ type: 'bot_command', offset: 4, length: 6 }],
    });
    expect(signal(update)).toEqual({
      kind: 'signal',
      signal: { ...HEAD, kind: 'text', text },
    });
  });
});

// Точки входа: `/команда` ищется в таблице точек входа — вход берут
// из точки, не по имени входа. Имя команды приводится к нижнему регистру,
// `cancel` и `back` — раньше таблицы. `/start <параметр>`: параметр выбирает
// вход точки `link`, иначе — как `/start`; сам параметр в сигнал не идёт.
// Имени нет в таблице — вход-заглушка `UNKNOWN_ENTRY`: «Такого входа нет.»
// скажет беседа.

const BOT = 7350007777;

const point = (entry: string, via: string, key: string) => ({
  entry,
  via,
  key,
});
const START = point('start', 'command', 'start');

/** Перевод с таблицей `entryPoints`: экземпляр со спекой `{ entryPoints, bot }`. */
const withTable = (entryPoints: readonly ReturnType<typeof point>[]) => {
  const signals = new TelegramSignals({ entryPoints, bot: BOT });
  return (update: unknown) => signals.of(update);
};

/** Сигнал `enter` на вход `entry`: без поля `param`. */
const entered = (entry: string) => ({
  kind: 'signal' as const,
  signal: { ...HEAD, kind: 'enter' as const, entry },
});

/** Заглушка «входа нет»: модуль точек входа ещё не написан — читаем в самой сцене. */
const unknownEntry = async () =>
  (await import('../entries/telegram-entries.const')).UNKNOWN_ENTRY;

describe('TelegramSignals — точки входа: команда по таблице', () => {
  test('/tasks при точке { start, command, tasks } → enter start', () => {
    const of = withTable([point('start', 'command', 'tasks')]);

    expect(of(command('/tasks'))).toStrictEqual(entered('start'));
  });

  test('/start при точке { assigned, command, start } → enter assigned: по таблице, не по имени входа', () => {
    const of = withTable([point('assigned', 'command', 'start')]);

    expect(of(command('/start'))).toStrictEqual(entered('assigned'));
  });

  test('точка menu — та же команда: /tasks при { start, menu, tasks } → enter start', () => {
    const of = withTable([START, point('start', 'menu', 'tasks')]);

    expect(of(command('/tasks'))).toStrictEqual(entered('start'));
  });

  test('/x@bot — суффикс бота отброшен', () => {
    const of = withTable([point('start', 'command', 'x')]);

    expect(of(command('/x@example_bot'))).toStrictEqual(entered('start'));
  });

  test('имя не в таблице → enter с заглушкой UNKNOWN_ENTRY', async () => {
    const of = withTable([START]);
    const unknown = await unknownEntry();

    expect(unknown).not.toBe('start');
    expect(of(command('/nope'))).toStrictEqual(entered(unknown));
    expect(of(command('/nope@example_bot'))).toStrictEqual(entered(unknown));
  });

  test('вход приложения без точки командой не открывается: /assigned без точки → заглушка', async () => {
    const of = withTable([START]);

    expect(of(command('/assigned'))).toStrictEqual(
      entered(await unknownEntry()),
    );
  });

  test('/start без точки start в таблице → заглушка, не вход start', async () => {
    const of = withTable([point('assigned', 'command', 'assigned')]);

    expect(of(command('/start'))).toStrictEqual(entered(await unknownEntry()));
  });
});

describe('TelegramSignals — точки входа: параметр ссылки', () => {
  const of = withTable([START, point('assigned', 'link', 'abc')]);

  test('/start abc при точке link abc → вход точки; поля param у сигнала нет', () => {
    const outcome = of(command('/start abc'));

    expect(outcome).toStrictEqual(entered('assigned'));
    expect(JSON.stringify(outcome)).not.toContain('param');
  });

  test('/start@bot abc — то же', () => {
    expect(of(command('/start@example_bot abc'))).toStrictEqual(
      entered('assigned'),
    );
  });

  test('параметр в формате, но не в таблице → вход точки /start', () => {
    expect(of(command('/start xyz'))).toStrictEqual(entered('start'));
  });

  test('/start без параметра → вход точки /start', () => {
    expect(of(command('/start'))).toStrictEqual(entered('start'));
  });

  for (const [name, param] of [
    ['длиннее 64', 'a'.repeat(65)],
    ['с чужим знаком', 'ab$c'],
    ['кириллица', 'хлеб'],
    ['два слова', 'ab cd'],
    ['с точкой', 'a.b'],
  ] as const) {
    test(`параметр ${name} → вход точки /start, параметр нигде не виден`, () => {
      const outcome = of(command(`/start ${param}`));

      expect(outcome).toStrictEqual(entered('start'));
      expect(JSON.stringify(outcome)).not.toContain(param);
    });
  }

  test('параметр из [A-Za-z0-9_-] длиной 64, объявленный в таблице → вход точки', () => {
    const param = `${'a'.repeat(60)}Z9_-`;
    const long = withTable([START, point('assigned', 'link', param)]);

    expect(param).toHaveLength(64);
    expect(long(command(`/start ${param}`))).toStrictEqual(entered('assigned'));
  });

  test('без точки /start: параметр из таблицы входит, прочие — заглушка', async () => {
    const onlyLink = withTable([point('assigned', 'link', 'abc')]);

    expect(onlyLink(command('/start abc'))).toStrictEqual(entered('assigned'));
    expect(onlyLink(command('/start xyz'))).toStrictEqual(
      entered(await unknownEntry()),
    );
    expect(onlyLink(command('/start'))).toStrictEqual(
      entered(await unknownEntry()),
    );
  });

  test('ключ command параметром не работает: /start tasks при command tasks → вход /start', () => {
    const table = withTable([START, point('assigned', 'command', 'tasks')]);

    expect(table(command('/start tasks'))).toStrictEqual(entered('start'));
  });

  test('отправитель и собеседник — from и chat, не параметр', () => {
    const outcome = of(command('/start abc')) as {
      signal: { peer: string; sender: string };
    };

    expect(outcome.signal.peer).toBe(String(ME));
    expect(outcome.signal.sender).toBe(String(ME));
  });
});

describe('TelegramSignals — точки входа: регистр', () => {
  test('/Tasks → как /tasks', () => {
    const of = withTable([point('start', 'command', 'tasks')]);

    expect(of(command('/Tasks'))).toStrictEqual(entered('start'));
    expect(of(command('/TASKS@example_bot'))).toStrictEqual(entered('start'));
  });

  test('/Start → как /start', () => {
    const of = withTable([point('assigned', 'command', 'start')]);

    expect(of(command('/Start'))).toStrictEqual(entered('assigned'));
  });

  test('/CANCEL → cancel, /Back → back', () => {
    const of = withTable([START]);

    expect(of(command('/CANCEL'))).toStrictEqual({
      kind: 'signal',
      signal: { ...HEAD, kind: 'cancel' },
    });
    expect(of(command('/Back'))).toStrictEqual({
      kind: 'signal',
      signal: { ...HEAD, kind: 'back' },
    });
  });
});

describe('TelegramSignals — точки входа: cancel и back раньше таблицы', () => {
  const of = withTable([
    START,
    point('start', 'command', 'cancel'),
    point('assigned', 'menu', 'back'),
    point('assigned', 'link', 'cancel'),
  ]);

  test('/cancel и /back — сигналы беседы, даже если таблица объявила их командами', () => {
    expect(of(command('/cancel'))).toStrictEqual({
      kind: 'signal',
      signal: { ...HEAD, kind: 'cancel' },
    });
    expect(of(command('/back'))).toStrictEqual({
      kind: 'signal',
      signal: { ...HEAD, kind: 'back' },
    });
  });

  test('/start cancel — параметр ссылки, не отмена', () => {
    expect(of(command('/start cancel'))).toStrictEqual(entered('assigned'));
  });
});

describe('TelegramSignals — нажатие', () => {
  test('нажатие → press: ref — data, press — callback_query.id', () => {
    expect(signal(press())).toEqual({
      kind: 'signal',
      signal: { ...HEAD, id: '102', kind: 'press', ref: 'r1', press: 'cq-7' },
    });
  });

  for (const [name, chat] of [
    ['группе', group],
    ['супергруппе', supergroup],
  ] as const) {
    test(`нажатие в ${name} — отказ chat с id нажатия`, () => {
      const update = press({
        message: { message_id: 5, date: 1_700_000_000, chat },
      });
      expect(signal(update)).toEqual({
        kind: 'refused',
        reason: 'chat',
        update: 'callback_query',
        press: 'cq-7',
      });
    });
  }

  test('нажатие чужого человека в личном чате — отказ sender с id нажатия', () => {
    expect(signal(press({ from: user(OTHER) }))).toEqual({
      kind: 'refused',
      reason: 'sender',
      update: 'callback_query',
      press: 'cq-7',
    });
  });

  test('нажатие без message (инлайн-режим) — отказ inline с id нажатия', () => {
    const update = pressWithout('message', { inline_message_id: 'im-1' });
    expect(signal(update)).toEqual({
      kind: 'refused',
      reason: 'inline',
      update: 'callback_query',
      press: 'cq-7',
    });
  });

  test('нажатие без data — отказ data с id нажатия', () => {
    const update = pressWithout('data', { game_short_name: 'game' });
    expect(signal(update)).toEqual({
      kind: 'refused',
      reason: 'data',
      update: 'callback_query',
      press: 'cq-7',
    });
  });
});

describe('TelegramSignals — вложения', () => {
  const attachment = (kind: AttachmentKind, handle: string) => ({
    kind: 'signal' as const,
    signal: {
      ...HEAD,
      kind: 'attachment' as const,
      attachment: { kind, handle },
    },
  });

  test('фото → image самого крупного размера', () => {
    const photo = [
      { ...file('ph-s'), width: 90, height: 60 },
      { ...file('ph-l'), width: 1280, height: 853 },
      { ...file('ph-m'), width: 320, height: 213 },
    ];
    expect(signal(message({ photo, caption: 'чек' }))).toEqual(
      attachment('image', 'ph-l'),
    );
  });

  test('документ → file', () => {
    expect(signal(message({ document: file('doc-1') }))).toEqual(
      attachment('file', 'doc-1'),
    );
  });

  test('аудио и голос → audio', () => {
    expect(
      signal(message({ audio: { ...file('au-1'), duration: 3 } })),
    ).toEqual(attachment('audio', 'au-1'));
    expect(
      signal(message({ voice: { ...file('vo-1'), duration: 2 } })),
    ).toEqual(attachment('audio', 'vo-1'));
  });

  test('видео, кружок → video', () => {
    const size = { width: 640, height: 360, duration: 5 };
    expect(signal(message({ video: { ...file('vi-1'), ...size } }))).toEqual(
      attachment('video', 'vi-1'),
    );
    expect(
      signal(
        message({ video_note: { ...file('vn-1'), length: 240, duration: 4 } }),
      ),
    ).toEqual(attachment('video', 'vn-1'));
  });

  test('анимация → video, хотя Bot API ставит рядом и document', () => {
    const size = { width: 320, height: 240, duration: 2 };
    const update = message({
      animation: { ...file('an-1'), ...size },
      document: file('an-1-doc'),
    });
    expect(signal(update)).toEqual(attachment('video', 'an-1'));
  });

  for (const [name, fields] of [
    [
      'стикер',
      {
        sticker: {
          ...file('st-1'),
          type: 'regular',
          width: 512,
          height: 512,
          is_animated: false,
          is_video: false,
        },
      },
    ],
    ['место', { location: { latitude: 51.23, longitude: 51.37 } }],
    [
      'контакт',
      { contact: { phone_number: '+77000000000', first_name: 'Нурлан' } },
    ],
  ] as const) {
    test(`${name} — ничего`, () => {
      expect(signal(message(fields))).toEqual({ kind: 'ignored' });
    });
  }
});

describe('TelegramSignals — только личный чат', () => {
  for (const [name, chat] of [
    ['группа', group],
    ['супергруппа', supergroup],
    ['канал', channel],
  ] as const) {
    test(`сообщение в чате «${name}» — ничего`, () => {
      expect(signal(message({ text: 'Хлеб' }, chat))).toEqual({
        kind: 'ignored',
      });
    });
  }

  test('личное сообщение без from — отказ sender', () => {
    const update = {
      update_id: 101,
      message: {
        message_id: 5,
        date: 1_700_000_000,
        chat: privateChat(),
        text: 'Хлеб',
      },
    };
    expect(signal(update)).toEqual({
      kind: 'refused',
      reason: 'sender',
      update: 'message',
    });
  });

  test('личное сообщение, from.id ≠ chat.id — отказ sender', () => {
    expect(
      signal(message({ text: 'Хлеб' }, privateChat(), user(OTHER))),
    ).toEqual({
      kind: 'refused',
      reason: 'sender',
      update: 'message',
    });
  });

  test('личный чат с неположительным id — отказ chat', () => {
    const update = message({ text: 'Хлеб' }, privateChat(-42), user(-42));
    expect(signal(update)).toEqual({
      kind: 'refused',
      reason: 'chat',
      update: 'message',
    });
  });

  for (const key of ['edited_message', 'channel_post']) {
    test(`${key} — ничего`, () => {
      const update = {
        update_id: 103,
        [key]: {
          message_id: 6,
          date: 1_700_000_000,
          chat: key === 'channel_post' ? channel : privateChat(),
          ...(key === 'channel_post' ? {} : { from: user() }),
          text: 'Хлеб',
        },
      };
      expect(signal(update)).toEqual({ kind: 'ignored' });
    });
  }
});

describe('TelegramSignals — апдейт не по схеме', () => {
  for (const [name, update] of [
    ['null', null],
    ['строка', 'update'],
    ['число', 42],
    ['массив', []],
    ['нет update_id', { message: message({ text: 'Хлеб' }).message }],
    ['update_id строкой', { ...message({ text: 'Хлеб' }), update_id: '101' }],
    ['from не объект', message({ text: 'Хлеб' }, privateChat(), 'Нурлан')],
    [
      'chat.id строкой',
      message({ text: 'Хлеб' }, { id: String(ME), type: 'private' }),
    ],
  ] as const) {
    test(`${name} — отказ schema без нажатия`, () => {
      expect(signal(update)).toEqual({ kind: 'refused', reason: 'schema' });
    });
  }

  test('нажатие не по схеме, id читается — отказ schema с id нажатия', () => {
    const update = press({ from: { id: String(ME) } });
    expect(signal(update)).toEqual({
      kind: 'refused',
      reason: 'schema',
      update: 'callback_query',
      press: 'cq-7',
    });
  });

  test('нажатие без update_id, id читается — отказ schema с id нажатия', () => {
    const { callback_query } = press();
    expect(signal({ callback_query })).toEqual({
      kind: 'refused',
      reason: 'schema',
      update: 'callback_query',
      press: 'cq-7',
    });
  });

  test('id нажатия не строка — отказ schema без нажатия', () => {
    expect(signal(press({ id: 7, from: 'x' }))).toEqual({
      kind: 'refused',
      reason: 'schema',
    });
  });
});

// Сообщество: `chat_member`, `my_chat_member` и `chat_join_request`
// группы переводятся в один сигнал сообщества на апдейт. Поля сигнала —
// строки: `id` — `update_id`, `community` — `chat.id` со знаком, `member` —
// по таблице перевода апдейтов. Группа — `group`/`supergroup` с безопасным целым
// `chat.id` < 0; эхо собственных операций бота отсекается без записи.

const ADMIN = 7350002222;
const NEWBIE = 7350003333;
const LEFT = { status: 'left' };
const KICKED = { status: 'kicked' };
const MEMBER = { status: 'member' };
const ADMINISTRATOR = { status: 'administrator' };
const CREATOR = { status: 'creator' };
const RESTRICTED_IN = { status: 'restricted', is_member: true };
const RESTRICTED_OUT = { status: 'restricted', is_member: false };
type Status = Record<string, unknown>;

const withUser = (status: Status, id = NEWBIE) => ({
  user: user(id),
  ...status,
});

/** `chat_member` группы: `from` — кто действовал, `old`/`next` — статусы `NEWBIE`. */
const chatMember = (
  old: Status,
  next: Status,
  by = ADMIN,
  chat: Record<string, unknown> = supergroup,
) => ({
  update_id: 201,
  chat_member: {
    chat,
    from: user(by),
    date: 1_700_000_000,
    old_chat_member: withUser(old),
    new_chat_member: withUser(next),
  },
});

/** `my_chat_member`: статус самого бота; `from` — кто его добавил или убрал. */
const botMember = (
  old: Status,
  next: Status,
  by = ADMIN,
  chat: Record<string, unknown> = supergroup,
) => ({
  update_id: 202,
  my_chat_member: {
    chat,
    from: user(by),
    date: 1_700_000_000,
    old_chat_member: withUser(old, BOT),
    new_chat_member: withUser(next, BOT),
  },
});

const joinRequest = (
  chat: Record<string, unknown> = supergroup,
  by = NEWBIE,
) => ({
  update_id: 203,
  chat_join_request: {
    chat,
    from: user(by),
    user_chat_id: by,
    date: 1_700_000_000,
  },
});

/** Сигнал сообщества: `community` — `chat.id` строкой со знаком. */
const community = (
  id: number,
  kind: CommunitySignalKind,
  chat: { id: number },
  member: number,
) => ({
  kind: 'community' as const,
  signal: {
    id: String(id),
    kind,
    community: String(chat.id),
    member: String(member),
  },
});

describe('TelegramSignals — chat_member', () => {
  for (const [fromName, old] of [
    ['left', LEFT],
    ['kicked', KICKED],
    ['restricted с is_member: false', RESTRICTED_OUT],
  ] as const) {
    for (const [toName, next] of [
      ['member', MEMBER],
      ['administrator', ADMINISTRATOR],
      ['creator', CREATOR],
      ['restricted с is_member: true', RESTRICTED_IN],
    ] as const) {
      test(`${fromName} → ${toName} — joined: member — new_chat_member.user, community — chat.id со знаком`, () => {
        expect(signal(chatMember(old, next))).toEqual(
          community(201, 'joined', supergroup, NEWBIE),
        );
      });
    }
  }

  for (const [name, old] of [
    ['member', MEMBER],
    ['administrator', ADMINISTRATOR],
    ['creator', CREATOR],
    ['restricted с is_member: true', RESTRICTED_IN],
  ] as const) {
    for (const next of [LEFT, KICKED, RESTRICTED_OUT]) {
      test(`${name} → ${next.status}${next === RESTRICTED_OUT ? ' с is_member: false' : ''} — left`, () => {
        expect(signal(chatMember(old, next))).toEqual(
          community(201, 'left', supergroup, NEWBIE),
        );
      });
    }
  }

  for (const [name, old, next] of [
    ['member → administrator (повышение)', MEMBER, ADMINISTRATOR],
    ['administrator → member (понижение)', ADMINISTRATOR, MEMBER],
    [
      'member → restricted с is_member: true (ограничение)',
      MEMBER,
      RESTRICTED_IN,
    ],
    ['restricted(is_member) → member', RESTRICTED_IN, MEMBER],
    ['left → kicked (бан вне группы)', LEFT, KICKED],
    ['kicked → left (разбан)', KICKED, LEFT],
    ['left → restricted с is_member: false', LEFT, RESTRICTED_OUT],
    ['restricted(false) → kicked', RESTRICTED_OUT, KICKED],
    ['member → member', MEMBER, MEMBER],
  ] as const) {
    test(`${name} — ничего`, () => {
      expect(signal(chatMember(old, next))).toEqual({ kind: 'ignored' });
    });
  }

  test('поля сигнала — строки: id — update_id, community — chat.id группы (не супергруппы) со знаком, member — id участника', () => {
    expect(signal(chatMember(MEMBER, LEFT, ADMIN, group))).toEqual({
      kind: 'community',
      signal: {
        id: '201',
        kind: 'left',
        community: '-4001234567',
        member: String(NEWBIE),
      },
    });
  });

  test('member — участник из new_chat_member, а не тот, кто действовал: from.id не попадает в сигнал', () => {
    const outcome = signal(chatMember(LEFT, MEMBER, ADMIN));

    expect(outcome).toMatchObject({ signal: { member: String(NEWBIE) } });
    expect(JSON.stringify(outcome)).not.toContain(String(ADMIN));
  });

  for (const [name, bad] of [
    [
      'restricted без is_member в new_chat_member',
      chatMember(MEMBER, { status: 'restricted' }),
    ],
    [
      'restricted без is_member в old_chat_member',
      chatMember({ status: 'restricted' }, MEMBER),
    ],
    [
      'is_member строкой',
      chatMember(MEMBER, { status: 'restricted', is_member: 'true' }),
    ],
    ['статус не строка', chatMember(MEMBER, { status: 7 })],
    [
      'нет new_chat_member',
      {
        update_id: 201,
        chat_member: {
          chat: supergroup,
          from: user(ADMIN),
          date: 1,
          old_chat_member: withUser(MEMBER),
        },
      },
    ],
    [
      'old_chat_member — строка',
      {
        update_id: 201,
        chat_member: {
          chat: supergroup,
          from: user(ADMIN),
          date: 1,
          old_chat_member: 'member',
          new_chat_member: withUser(LEFT),
        },
      },
    ],
    [
      'нет from',
      {
        update_id: 201,
        chat_member: {
          chat: supergroup,
          date: 1,
          old_chat_member: withUser(MEMBER),
          new_chat_member: withUser(LEFT),
        },
      },
    ],
    [
      'chat.id небезопасное целое',
      chatMember(MEMBER, LEFT, ADMIN, { id: -(2 ** 60), type: 'supergroup' }),
    ],
  ] as const) {
    test(`${name} — отказ schema с видом апдейта`, () => {
      expect(signal(bad)).toEqual({
        kind: 'refused',
        reason: 'schema',
        update: 'chat_member',
      });
    });
  }
});

describe('TelegramSignals — my_chat_member', () => {
  for (const [name, old, next] of [
    ['left → member', LEFT, MEMBER],
    ['kicked → member', KICKED, MEMBER],
    ['left → administrator', LEFT, ADMINISTRATOR],
    ['restricted(false) → member', RESTRICTED_OUT, MEMBER],
  ] as const) {
    test(`бота добавили (${name}) — added: member — from.id, кто добавил`, () => {
      expect(signal(botMember(old, next))).toEqual(
        community(202, 'added', supergroup, ADMIN),
      );
    });
  }

  for (const [name, old, next] of [
    ['member → left', MEMBER, LEFT],
    ['member → kicked', MEMBER, KICKED],
    ['administrator → left', ADMINISTRATOR, LEFT],
    ['restricted(true) → left', RESTRICTED_IN, LEFT],
  ] as const) {
    test(`бота убрали (${name}) — removed: member — from.id, кто убрал`, () => {
      expect(signal(botMember(old, next))).toEqual(
        community(202, 'removed', supergroup, ADMIN),
      );
    });
  }

  for (const [name, old, next] of [
    ['member → administrator', MEMBER, ADMINISTRATOR],
    ['administrator → member', ADMINISTRATOR, MEMBER],
    ['left → kicked', LEFT, KICKED],
  ] as const) {
    test(`${name} — ничего: бот остался в группе или вне её`, () => {
      expect(signal(botMember(old, next))).toEqual({ kind: 'ignored' });
    });
  }

  test('в группе (не супергруппе): community — chat.id со знаком', () => {
    expect(signal(botMember(LEFT, MEMBER, ADMIN, group))).toEqual(
      community(202, 'added', group, ADMIN),
    );
  });

  test('new_chat_member.user — не бот проекта: сигнала нет, итог wrongBot', () => {
    const update = botMember(LEFT, MEMBER);
    update.my_chat_member.new_chat_member = withUser(MEMBER, NEWBIE);

    expect(signal(update)).toEqual({ kind: 'wrongBot' });
  });

  test('блокировка и разблокировка бота в личном чате — ничего, отказа нет', () => {
    expect(signal(botMember(MEMBER, KICKED, ME, privateChat()))).toEqual({
      kind: 'ignored',
    });
    expect(signal(botMember(KICKED, MEMBER, ME, privateChat()))).toEqual({
      kind: 'ignored',
    });
  });

  test('my_chat_member не по схеме — отказ schema с видом апдейта', () => {
    const update = {
      update_id: 202,
      my_chat_member: { chat: supergroup, from: user(ADMIN), date: 1 },
    };

    expect(signal(update)).toEqual({
      kind: 'refused',
      reason: 'schema',
      update: 'my_chat_member',
    });
  });
});

describe('TelegramSignals — chat_join_request', () => {
  test('заявка в группу — requested: member — from.id, подавший заявку', () => {
    expect(signal(joinRequest())).toEqual(
      community(203, 'requested', supergroup, NEWBIE),
    );
  });

  test('заявка в группу (type group) — community со знаком', () => {
    expect(signal(joinRequest(group))).toEqual(
      community(203, 'requested', group, NEWBIE),
    );
  });

  test('заявка без from — отказ schema с видом апдейта', () => {
    const update = {
      update_id: 203,
      chat_join_request: { chat: supergroup, date: 1, user_chat_id: NEWBIE },
    };

    expect(signal(update)).toEqual({
      kind: 'refused',
      reason: 'schema',
      update: 'chat_join_request',
    });
  });
});

describe('TelegramSignals — эхо бота', () => {
  for (const [name, old, next] of [
    ['ban', MEMBER, KICKED],
    ['unban', KICKED, LEFT],
    ['принятие заявки', LEFT, MEMBER],
  ] as const) {
    test(`chat_member от самого бота (${name}) — ничего: эхо собственной операции`, () => {
      expect(signal(chatMember(old, next, BOT))).toEqual({ kind: 'ignored' });
    });
  }

  test('тот же апдейт от человека-администратора — сигнал', () => {
    expect(signal(chatMember(LEFT, MEMBER, ADMIN))).toMatchObject({
      kind: 'community',
      signal: { kind: 'joined' },
    });
    expect(signal(chatMember(MEMBER, KICKED, ADMIN))).toMatchObject({
      kind: 'community',
      signal: { kind: 'left' },
    });
  });

  test('сам бот вышел или вошёл сам (new_chat_member.user — бот, from — человек) — сигнал', () => {
    const update = {
      update_id: 201,
      chat_member: {
        chat: supergroup,
        from: user(ADMIN),
        date: 1,
        old_chat_member: withUser(LEFT, BOT),
        new_chat_member: withUser(MEMBER, BOT),
      },
    };

    expect(signal(update)).toMatchObject({
      kind: 'community',
      signal: { kind: 'joined', member: String(BOT) },
    });
  });
});

describe('TelegramSignals — чат апдейта сообщества', () => {
  for (const [name, chat] of [
    ['id 0', { id: 0, type: 'group' }],
    ['положительный id группы', { id: 4001234567, type: 'supergroup' }],
    ['личный чат', privateChat()],
  ] as const) {
    test(`chat_member: ${name} — отказ chat с видом апдейта`, () => {
      expect(signal(chatMember(LEFT, MEMBER, ADMIN, chat))).toEqual({
        kind: 'refused',
        reason: 'chat',
        update: 'chat_member',
      });
    });

    test(`chat_join_request: ${name} — отказ chat с видом апдейта`, () => {
      expect(signal(joinRequest(chat))).toEqual({
        kind: 'refused',
        reason: 'chat',
        update: 'chat_join_request',
      });
    });
  }

  for (const [name, chat] of [
    ['id 0', { id: 0, type: 'group' }],
    ['положительный id группы', { id: 4001234567, type: 'supergroup' }],
  ] as const) {
    test(`my_chat_member: ${name} — отказ chat с видом апдейта`, () => {
      expect(signal(botMember(LEFT, MEMBER, ADMIN, chat))).toEqual({
        kind: 'refused',
        reason: 'chat',
        update: 'my_chat_member',
      });
    });
  }

  // Решение orchestrator: бот в канале — не ошибка и не шум, как `channel_post`.
  test('канал: chat_member и my_chat_member — ничего без записи', () => {
    expect(signal(chatMember(LEFT, MEMBER, ADMIN, channel))).toEqual({
      kind: 'ignored',
    });
    expect(signal(botMember(LEFT, MEMBER, ADMIN, channel))).toEqual({
      kind: 'ignored',
    });
  });

  test('канал: chat_join_request — отказ chat с видом апдейта', () => {
    expect(signal(joinRequest(channel))).toEqual({
      kind: 'refused',
      reason: 'chat',
      update: 'chat_join_request',
    });
  });
});

describe('TelegramSignals — поля сигнала только из схемы', () => {
  test('лишние поля апдейта и __proto__ не читаются: у сигнала ровно id, kind, community, member', () => {
    const update = JSON.parse(`{
      "update_id": 201,
      "kind": "removed",
      "community": "-1",
      "member": "1",
      "chat_member": {
        "kind": "removed",
        "community": "-1",
        "member": "1",
        "__proto__": { "member": "evil", "kind": "removed" },
        "chat": { "id": ${supergroup.id}, "type": "supergroup", "community": "-1" },
        "from": { "id": ${ADMIN}, "is_bot": false, "first_name": "А" },
        "date": 1,
        "old_chat_member": { "status": "left", "user": { "id": ${NEWBIE}, "__proto__": { "id": 1 } } },
        "new_chat_member": { "status": "member", "user": { "id": ${NEWBIE}, "member": "2" } }
      }
    }`);

    const outcome = signal(update);

    expect(outcome).toStrictEqual({
      kind: 'community',
      signal: {
        id: '201',
        kind: 'joined',
        community: String(supergroup.id),
        member: String(NEWBIE),
      },
    });
    expect(Object.keys((outcome as { signal: object }).signal).sort()).toEqual([
      'community',
      'id',
      'kind',
      'member',
    ]);
  });

  test('id, community и member — всегда строки', () => {
    for (const update of [
      chatMember(LEFT, MEMBER),
      botMember(LEFT, MEMBER),
      joinRequest(),
    ]) {
      const outcome = signal(update);
      if (outcome.kind !== 'community') throw new Error('нужен сигнал');
      expect(typeof outcome.signal.id).toBe('string');
      expect(typeof outcome.signal.community).toBe('string');
      expect(typeof outcome.signal.member).toBe('string');
    }
  });
});

describe('TelegramSignals — группа не диалог', () => {
  test('команда в группе — ничего: ни сигнала диалога, ни сигнала сообщества', () => {
    const update = message(
      {
        text: '/start@bot',
        entities: [{ type: 'bot_command', offset: 0, length: 10 }],
      },
      supergroup,
      user(NEWBIE),
    );

    expect(signal(update)).toEqual({ kind: 'ignored' });
  });

  test('текст в группе от человека — ничего', () => {
    expect(signal(message({ text: 'Хлеб' }, group, user(NEWBIE)))).toEqual({
      kind: 'ignored',
    });
  });
});

describe('TelegramSignals — виды апдейта пакета', () => {
  /** По апдейту на каждый вид, который читает пакет: перевод не «ничего». */
  const SAMPLES: Record<string, unknown> = {
    message: message({ text: 'Хлеб' }),
    callback_query: press(),
    my_chat_member: botMember(LEFT, MEMBER),
    chat_member: chatMember(LEFT, MEMBER),
    chat_join_request: joinRequest(),
  };

  test('TELEGRAM_ALLOWED_UPDATES — ровно виды из сцен ниже', () => {
    const allowed: string[] = [...TELEGRAM_ALLOWED_UPDATES];
    expect(allowed.sort()).toEqual(Object.keys(SAMPLES).sort());
  });

  for (const kind of TELEGRAM_ALLOWED_UPDATES) {
    test(`вид ${kind} — переводится в сигнал`, () => {
      expect(signal(SAMPLES[kind]).kind).toBe(
        kind === 'message' || kind === 'callback_query'
          ? 'signal'
          : 'community',
      );
    });
  }

  test('вид вне TELEGRAM_ALLOWED_UPDATES — ничего', () => {
    expect(signal({ update_id: 9, poll: { id: 'p' } })).toEqual({
      kind: 'ignored',
    });
  });
});

describe('TelegramSignals — сборка и недоверенный ввод', () => {
  for (const bot of [
    0,
    -1,
    1.5,
    Number.NaN,
    2 ** 60,
    Number.POSITIVE_INFINITY,
  ]) {
    test(`bot ${String(bot)} — бросок сборки`, () => {
      expect(() => new TelegramSignals({ entryPoints: [], bot })).toThrow();
    });
  }

  test('параметр /start — не личность: sender и peer из from, параметр похож на чужой id', () => {
    const outcome = signal(command(`/start ${OTHER}`));

    expect(outcome).toEqual({
      kind: 'signal',
      signal: { ...HEAD, kind: 'enter', entry: 'start' },
    });
    expect(JSON.stringify(outcome)).not.toContain(String(OTHER));
  });
});

// `/help` — третье имя беседы после `cancel` и `back`: приём отдаёт его
// беседе раньше таблицы точек входа (резерв TG-04), в личном чате.

const HELP = {
  kind: 'signal' as const,
  signal: { ...HEAD, kind: 'help' as const },
};

describe('TelegramSignals — /help: сигнал беседы раньше таблицы', () => {
  test('/help → help; суффикс бота отброшен; регистр не важен', () => {
    const of = withTable([START]);

    expect(of(command('/help'))).toStrictEqual(HELP);
    expect(of(command('/help@example_bot'))).toStrictEqual(HELP);
    expect(of(command('/Help'))).toStrictEqual(HELP);
  });

  test('точки command и menu с ключом help не побеждают: /help — сигнал беседы', () => {
    const of = withTable([
      START,
      point('start', 'command', 'help'),
      point('assigned', 'menu', 'help'),
    ]);

    expect(of(command('/help'))).toStrictEqual(HELP);
  });

  test('/start help — параметр ссылки, не справка: вход точки link, а без неё — вход /start', () => {
    const linked = withTable([START, point('assigned', 'link', 'help')]);
    const plain = withTable([START]);

    expect(linked(command('/start help'))).toStrictEqual(entered('assigned'));
    expect(plain(command('/start help'))).toStrictEqual(entered('start'));
  });

  test('/help с текстом после команды — всё равно справка, текст в сигнал не идёт', () => {
    const outcome = withTable([START])(command('/help что делать'));

    expect(outcome).toStrictEqual(HELP);
    expect(JSON.stringify(outcome)).not.toContain('что делать');
  });

  test('/help в группе — ничего', () => {
    const update = message(
      {
        text: '/help',
        entities: [{ type: 'bot_command', offset: 0, length: 5 }],
      },
      group,
    );

    expect(withTable([START])(update)).toEqual({ kind: 'ignored' });
  });
});
