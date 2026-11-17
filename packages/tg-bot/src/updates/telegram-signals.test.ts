import { describe, expect, test } from 'bun:test';
import type { AttachmentKind } from 'dmg-ui/chat-ui';
import { TelegramSignals } from './telegram-signals';

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

const signal = (update: unknown) => TelegramSignals.of(update);

describe('TelegramSignals — текст и команды', () => {
  test('личный текст → text: id — update_id, peer — chat.id, sender — from.id', () => {
    expect(signal(message({ text: 'Хлеб' }))).toEqual({
      kind: 'signal',
      signal: { ...HEAD, kind: 'text', text: 'Хлеб' },
    });
  });

  test('/start → вход start без параметра', () => {
    expect(signal(command('/start'))).toEqual({
      kind: 'signal',
      signal: { ...HEAD, kind: 'enter', entry: 'start' },
    });
  });

  test('/start abc_1 → вход start с параметром', () => {
    expect(signal(command('/start abc_1'))).toEqual({
      kind: 'signal',
      signal: { ...HEAD, kind: 'enter', entry: 'start', param: 'abc_1' },
    });
  });

  test('параметр из [A-Za-z0-9_-] длиной 64 — с параметром', () => {
    const param = `${'a'.repeat(60)}Z9_-`;
    expect(signal(command(`/start ${param}`))).toEqual({
      kind: 'signal',
      signal: { ...HEAD, kind: 'enter', entry: 'start', param },
    });
  });

  for (const [name, param] of [
    ['длиннее 64', 'a'.repeat(65)],
    ['с чужим знаком', 'ab$c'],
    ['кириллица', 'хлеб'],
    ['два слова', 'ab cd'],
  ] as const) {
    test(`параметр ${name} — вход без параметра`, () => {
      expect(signal(command(`/start ${param}`))).toEqual({
        kind: 'signal',
        signal: { ...HEAD, kind: 'enter', entry: 'start' },
      });
    });
  }

  test('/assigned → вход по имени assigned', () => {
    expect(signal(command('/assigned'))).toEqual({
      kind: 'signal',
      signal: { ...HEAD, kind: 'enter', entry: 'assigned' },
    });
  });

  test('/x@bot → вход x: имя бота после @ отбрасывается', () => {
    expect(signal(command('/x@u7_bot'))).toEqual({
      kind: 'signal',
      signal: { ...HEAD, kind: 'enter', entry: 'x' },
    });
  });

  test('/start@bot abc → вход start с параметром', () => {
    expect(signal(command('/start@u7_bot abc'))).toEqual({
      kind: 'signal',
      signal: { ...HEAD, kind: 'enter', entry: 'start', param: 'abc' },
    });
  });

  test('/cancel → cancel, /back → back', () => {
    expect(signal(command('/cancel'))).toEqual({
      kind: 'signal',
      signal: { ...HEAD, kind: 'cancel' },
    });
    expect(signal(command('/back@u7_bot'))).toEqual({
      kind: 'signal',
      signal: { ...HEAD, kind: 'back' },
    });
  });

  test('незнакомая команда /nope → вход nope: его встретит беседа', () => {
    expect(signal(command('/nope'))).toEqual({
      kind: 'signal',
      signal: { ...HEAD, kind: 'enter', entry: 'nope' },
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

  for (const key of ['my_chat_member', 'chat_member', 'chat_join_request']) {
    test(`${key} — ничего`, () => {
      const update = {
        update_id: 104,
        [key]: { chat: group, from: user(), date: 1_700_000_000 },
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
