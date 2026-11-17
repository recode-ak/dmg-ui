import { TEST_UPDATES } from './test-updates.const';
import type {
  TestPressUpdate,
  TestPrivateChat,
  TestTextUpdate,
  TestUser,
} from './test-updates.types';

/**
 * Построитель апдейтов Bot API личного чата для тестов (D-UI-63): `update_id`
 * растёт с 1 на каждый апдейт, id нажатия уникален. Текст с `/` в начале —
 * команда с сущностью `bot_command` на первое слово, как у клиента Telegram.
 * Чат и человек — одно число `user`.
 */
export class TestUpdates {
  private updateId = 0;
  private messageId = 0;

  /** Текст человека `user` в личном чате с ботом. */
  text(user: number, text: string): TestTextUpdate {
    this.messageId += 1;
    const command = text.startsWith('/')
      ? {
          entities: [
            {
              type: 'bot_command' as const,
              offset: 0 as const,
              length: text.split(' ')[0]?.length ?? text.length,
            },
          ],
        }
      : {};
    return {
      update_id: this.next(),
      message: {
        message_id: this.messageId,
        date: TEST_UPDATES.date,
        chat: TestUpdates.chat(user),
        from: TestUpdates.user(user),
        text,
        ...command,
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

  private static user(id: number): TestUser {
    return { id, is_bot: false, first_name: TEST_UPDATES.firstName };
  }

  private static chat(id: number): TestPrivateChat {
    return { id, type: 'private' };
  }
}
