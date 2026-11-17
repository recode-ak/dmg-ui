import { TEST_UPDATES } from './test-updates.const';
import type {
  TestChatMemberUpdate,
  TestGroupChat,
  TestGroupTextUpdate,
  TestJoinRequestUpdate,
  TestMemberChange,
  TestMyChatMemberUpdate,
  TestPressUpdate,
  TestPrivateChat,
  TestTextUpdate,
  TestUser,
} from './test-updates.types';

/**
 * Построитель апдейтов Bot API для тестов (D-UI-63): `update_id` общий и
 * растёт с 1 на каждый апдейт, `message_id` — в каждом чате отдельно, id
 * нажатия уникален. Текст с `/` в начале — команда с сущностью `bot_command`
 * на первое слово, как у клиента Telegram. Личный чат и человек — одно число
 * `user`; группа — отрицательный `chat`, `by` — кто действовал.
 */
export class TestUpdates {
  private updateId = 0;
  private readonly messageIds = new Map<number, number>();

  /** Текст человека `user` в личном чате с ботом. */
  text(user: number, text: string): TestTextUpdate {
    return {
      update_id: this.next(),
      message: {
        message_id: this.nextMessage(user),
        date: TEST_UPDATES.date,
        chat: TestUpdates.chat(user),
        from: TestUpdates.user(user),
        text,
        ...TestUpdates.command(text),
      },
    };
  }

  /** Текст человека `user` в группе `chat`. */
  groupText(chat: number, user: number, text: string): TestGroupTextUpdate {
    return {
      update_id: this.next(),
      message: {
        message_id: this.nextMessage(chat),
        date: TEST_UPDATES.date,
        chat: TestUpdates.group(chat),
        from: TestUpdates.user(user),
        text,
        ...TestUpdates.command(text),
      },
    };
  }

  /** `user` вступил в группу (`chat_member`: left → member); `by` — кто действовал. */
  joined(chat: number, user: number, by: number): TestChatMemberUpdate {
    return {
      update_id: this.next(),
      chat_member: TestUpdates.change(chat, by, user, 'left', 'member'),
    };
  }

  /** `user` вышел из группы (`chat_member`: member → left). */
  left(chat: number, user: number, by: number): TestChatMemberUpdate {
    return {
      update_id: this.next(),
      chat_member: TestUpdates.change(chat, by, user, 'member', 'left'),
    };
  }

  /** Бота добавили в группу (`my_chat_member`: left → member); `by` — кто добавил. */
  botAdded(chat: number, by: number): TestMyChatMemberUpdate {
    return {
      update_id: this.next(),
      my_chat_member: TestUpdates.change(
        chat,
        by,
        TEST_UPDATES.botId,
        'left',
        'member',
      ),
    };
  }

  /** Бота убрали из группы (`my_chat_member`: member → left); `by` — кто убрал. */
  botRemoved(chat: number, by: number): TestMyChatMemberUpdate {
    return {
      update_id: this.next(),
      my_chat_member: TestUpdates.change(
        chat,
        by,
        TEST_UPDATES.botId,
        'member',
        'left',
      ),
    };
  }

  /** Заявка `user` на вступление в группу. */
  joinRequest(chat: number, user: number): TestJoinRequestUpdate {
    return {
      update_id: this.next(),
      chat_join_request: {
        chat: TestUpdates.group(chat),
        from: TestUpdates.user(user),
        user_chat_id: user,
        date: TEST_UPDATES.date,
      },
    };
  }

  /** Нажатие человеком `user` кнопки с `data` на сообщении `messageId` его чата. */
  press(user: number, data: string, messageId: number): TestPressUpdate {
    const updateId = this.next();
    return {
      update_id: updateId,
      callback_query: {
        id: `cq${updateId}`,
        from: TestUpdates.user(user),
        chat_instance: TEST_UPDATES.chatInstance,
        message: {
          message_id: messageId,
          date: TEST_UPDATES.date,
          chat: TestUpdates.chat(user),
        },
        data,
      },
    };
  }

  private next(): number {
    this.updateId += 1;
    return this.updateId;
  }

  /** Следующий `message_id` чата: счётчик у каждого чата свой. */
  private nextMessage(chat: number): number {
    const next = (this.messageIds.get(chat) ?? 0) + 1;
    this.messageIds.set(chat, next);
    return next;
  }

  /** Сущность `bot_command` на первое слово текста, если он начинается с `/`. */
  private static command(text: string): {
    readonly entities?: TestTextUpdate['message']['entities'];
  } {
    if (!text.startsWith('/')) return {};
    const length = text.split(' ')[0]?.length ?? text.length;
    return { entities: [{ type: 'bot_command', offset: 0, length }] };
  }

  private static change(
    chat: number,
    by: number,
    member: number,
    was: 'left' | 'member',
    now: 'left' | 'member',
  ): TestMemberChange {
    const user =
      member === TEST_UPDATES.botId
        ? TestUpdates.bot()
        : TestUpdates.user(member);
    return {
      chat: TestUpdates.group(chat),
      from: TestUpdates.user(by),
      date: TEST_UPDATES.date,
      old_chat_member: { user, status: was },
      new_chat_member: { user, status: now },
    };
  }

  private static bot(): TestUser {
    return {
      id: TEST_UPDATES.botId,
      is_bot: true,
      first_name: TEST_UPDATES.firstName,
    };
  }

  private static group(id: number): TestGroupChat {
    return { id, type: 'supergroup', title: TEST_UPDATES.groupTitle };
  }

  private static user(id: number): TestUser {
    return { id, is_bot: false, first_name: TEST_UPDATES.firstName };
  }

  private static chat(id: number): TestPrivateChat {
    return { id, type: 'private' };
  }
}
