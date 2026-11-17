import { describe, expect, test } from 'bun:test';
import { TestUpdates } from '..';

// Построитель апдейтов Bot API для тестов: `update_id` общий и растёт с 1 на
// каждый апдейт, `message_id` растёт в каждом чате отдельно (личном и
// группе), апдейты группы — по форме Bot API. Имена методов группы
// (`groupText`, `joined`, `left`, `botAdded`, `botRemoved`, `joinRequest`) и
// порядок параметров (чат, человек, кто действовал) — допущение до реализации.

const GROUP = -1004001234567;
const OTHER_GROUP = -1004007654321;
const A = 7350001234;
const B = 7350005678;
const ADMIN = 7350009000;

describe('TestUpdates — счётчики', () => {
  test('message_id растёт в каждом чате отдельно: личные чаты и группы не делят счётчик', () => {
    const updates = new TestUpdates();

    const ids = [
      updates.text(A, 'один').message.message_id,
      updates.text(B, 'один').message.message_id,
      updates.groupText(GROUP, A, 'один').message.message_id,
      updates.text(A, 'два').message.message_id,
      updates.groupText(GROUP, B, 'два').message.message_id,
      updates.groupText(OTHER_GROUP, A, 'один').message.message_id,
    ];

    expect(ids).toEqual([1, 1, 1, 2, 2, 1]);
  });

  test('update_id общий на все виды апдейтов и растёт с 1', () => {
    const updates = new TestUpdates();

    const ids = [
      updates.text(A, 'один').update_id,
      updates.groupText(GROUP, A, 'два').update_id,
      updates.joined(GROUP, B, ADMIN).update_id,
      updates.left(GROUP, B, ADMIN).update_id,
      updates.botAdded(GROUP, ADMIN).update_id,
      updates.botRemoved(GROUP, ADMIN).update_id,
      updates.joinRequest(GROUP, B).update_id,
      updates.press(A, 'r1', 1).update_id,
    ];

    expect(ids).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe('TestUpdates — форма апдейтов группы', () => {
  test('groupText — message группы: chat.id отрицательный, from — человек, не равный chat.id', () => {
    const update = new TestUpdates().groupText(GROUP, A, 'Привет');

    expect(update.message).toMatchObject({
      chat: { id: GROUP },
      from: { id: A },
      text: 'Привет',
    });
    expect(update.message.chat.type).toMatch(/group$/);
  });

  test('groupText с командой — сущность bot_command на первое слово, как у личного текста', () => {
    const update = new TestUpdates().groupText(GROUP, A, '/start@bot х');

    expect(update.message.entities).toEqual([
      { type: 'bot_command', offset: 0, length: '/start@bot'.length },
    ]);
  });

  test('joined — chat_member: left → member, from — кто действовал, user — вступивший', () => {
    const update = new TestUpdates().joined(GROUP, A, ADMIN);

    expect(update.chat_member).toMatchObject({
      chat: { id: GROUP },
      from: { id: ADMIN },
      old_chat_member: { status: 'left', user: { id: A } },
      new_chat_member: { status: 'member', user: { id: A } },
    });
    expect(update.chat_member.chat.type).toMatch(/group$/);
  });

  test('left — chat_member: member → left', () => {
    const update = new TestUpdates().left(GROUP, A, ADMIN);

    expect(update.chat_member).toMatchObject({
      chat: { id: GROUP },
      from: { id: ADMIN },
      old_chat_member: { status: 'member', user: { id: A } },
      new_chat_member: { status: 'left', user: { id: A } },
    });
  });

  test('botAdded — my_chat_member: left → member, from — кто добавил', () => {
    const update = new TestUpdates().botAdded(GROUP, ADMIN);

    expect(update.my_chat_member).toMatchObject({
      chat: { id: GROUP },
      from: { id: ADMIN },
      old_chat_member: { status: 'left' },
      new_chat_member: { status: 'member' },
    });
  });

  test('botRemoved — my_chat_member: member → left, from — кто убрал', () => {
    const update = new TestUpdates().botRemoved(GROUP, ADMIN);

    expect(update.my_chat_member).toMatchObject({
      chat: { id: GROUP },
      from: { id: ADMIN },
      old_chat_member: { status: 'member' },
      new_chat_member: { status: 'left' },
    });
  });

  test('joinRequest — chat_join_request: from — подавший заявку, chat — группа', () => {
    const update = new TestUpdates().joinRequest(GROUP, A);

    expect(update.chat_join_request).toMatchObject({
      chat: { id: GROUP },
      from: { id: A },
    });
  });
});
