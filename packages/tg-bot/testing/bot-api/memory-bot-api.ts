import type {
  AnswerCallbackQueryParams,
  BotApi,
  BotApiResult,
  EditMessageReplyMarkupParams,
  EditMessageTextParams,
  SendMessageParams,
  SetMyCommandsParams,
} from 'dmg-ui/tg-bot';
import { MEMORY_BOT_API_TEXTS } from './memory-bot-api.const';
import type {
  BotApiCall,
  BotApiFailNext,
  BotChatLine,
  PlannedFailure,
  StoredMessage,
} from './memory-bot-api.types';

/**
 * Подставной порт Bot API в памяти (D-UI-63): журнал вызовов как есть,
 * `message_id` растёт в каждом чате; правка неизвестного сообщения и правка
 * тем же содержимым отвечают отказом 400, как Bot API; `failNext` и
 * `throwNext` действуют на один следующий вызов (он есть в журнале, чат не
 * меняется). `chat(chatId)` — сообщения чата глазами собеседника.
 *
 * @see memory-bot-api.test.ts
 */
export class MemoryBotApi implements BotApi {
  readonly journal: BotApiCall[] = [];
  private readonly chats = new Map<number, StoredMessage[]>();
  private planned: PlannedFailure | undefined;

  /** Следующий вызов получит этот отказ. */
  failNext(failure: BotApiFailNext): void {
    this.planned = { kind: 'fail', failure };
  }

  /** Следующий вызов бросит (сбой транспорта). */
  throwNext(error: unknown = new Error(MEMORY_BOT_API_TEXTS.thrown)): void {
    this.planned = { kind: 'throw', error };
  }

  /** Сообщения чата по порядку отправки. */
  chat(chatId: number): readonly BotChatLine[] {
    return (this.chats.get(chatId) ?? []).map((stored) => ({ ...stored }));
  }

  async sendMessage(params: SendMessageParams): Promise<BotApiResult<unknown>> {
    return this.handle({ method: 'sendMessage', params }, () => {
      const messages = this.messages(params.chat_id);
      const stored: StoredMessage = {
        message_id: messages.length + 1,
        text: params.text,
        entities: params.entities ?? [],
        keyboard: params.reply_markup?.inline_keyboard ?? [],
        edits: 0,
      };
      messages.push(stored);
      return MemoryBotApi.message(params.chat_id, stored);
    });
  }

  async editMessageText(
    params: EditMessageTextParams,
  ): Promise<BotApiResult<unknown>> {
    return this.handle({ method: 'editMessageText', params }, () =>
      this.edit(params.chat_id, params.message_id, {
        text: params.text,
        entities: params.entities ?? [],
        keyboard: params.reply_markup?.inline_keyboard ?? [],
      }),
    );
  }

  async editMessageReplyMarkup(
    params: EditMessageReplyMarkupParams,
  ): Promise<BotApiResult<unknown>> {
    return this.handle({ method: 'editMessageReplyMarkup', params }, () =>
      this.edit(params.chat_id, params.message_id, {
        keyboard: params.reply_markup?.inline_keyboard ?? [],
      }),
    );
  }

  async answerCallbackQuery(
    params: AnswerCallbackQueryParams,
  ): Promise<BotApiResult<unknown>> {
    return this.handle({ method: 'answerCallbackQuery', params }, () => ({
      ok: true,
      result: true,
    }));
  }

  async setMyCommands(
    params: SetMyCommandsParams,
  ): Promise<BotApiResult<unknown>> {
    return this.handle({ method: 'setMyCommands', params }, () => ({
      ok: true,
      result: true,
    }));
  }

  /** Запись в журнал, затем заданный сбой или обычный ответ. */
  private handle(
    call: BotApiCall,
    answer: () => BotApiResult<unknown>,
  ): BotApiResult<unknown> {
    this.journal.push(call);
    const planned = this.planned;
    this.planned = undefined;
    if (planned === undefined) return answer();
    switch (planned.kind) {
      case 'fail':
        return { ok: false, ...planned.failure };
      case 'throw':
        throw planned.error;
      default:
        planned satisfies never;
        return answer();
    }
  }

  /** Правка на месте; без изменений — 400 «message is not modified». */
  private edit(
    chatId: number,
    messageId: number,
    change: Partial<Pick<StoredMessage, 'text' | 'entities' | 'keyboard'>>,
  ): BotApiResult<unknown> {
    const stored = this.chats
      .get(chatId)
      ?.find((candidate) => candidate.message_id === messageId);
    if (stored === undefined) {
      return MemoryBotApi.badRequest(MEMORY_BOT_API_TEXTS.notFound);
    }
    const next = { ...stored, ...change };
    if (MemoryBotApi.sameContent(stored, next)) {
      return MemoryBotApi.badRequest(MEMORY_BOT_API_TEXTS.notModified);
    }
    Object.assign(stored, change, { edits: stored.edits + 1 });
    return MemoryBotApi.message(chatId, stored);
  }

  private messages(chatId: number): StoredMessage[] {
    const existing = this.chats.get(chatId);
    if (existing !== undefined) return existing;
    const created: StoredMessage[] = [];
    this.chats.set(chatId, created);
    return created;
  }

  /** Тот же текст, сущности и клавиатура; порядок ключей объектов не важен. */
  private static sameContent(a: StoredMessage, b: StoredMessage): boolean {
    return MemoryBotApi.fingerprint(a) === MemoryBotApi.fingerprint(b);
  }

  private static fingerprint(stored: StoredMessage): string {
    return JSON.stringify([
      stored.text,
      stored.entities.map((entity) => [
        entity.type,
        entity.offset,
        entity.length,
        entity.url ?? null,
      ]),
      stored.keyboard.map((row) =>
        row.map((button) => [button.text, button.callback_data]),
      ),
    ]);
  }

  /** `result` — сообщение, как у Bot API (подмножество полей). */
  private static message(
    chatId: number,
    stored: StoredMessage,
  ): BotApiResult<unknown> {
    return {
      ok: true,
      result: {
        message_id: stored.message_id,
        chat: { id: chatId, type: 'private' },
        text: stored.text,
      },
    };
  }

  private static badRequest(description: string): BotApiResult<unknown> {
    return { ok: false, error_code: 400, description };
  }
}
