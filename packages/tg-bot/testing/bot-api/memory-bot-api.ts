import type {
  AnswerCallbackQueryParams,
  ApproveChatJoinRequestParams,
  BanChatMemberParams,
  BotApi,
  BotApiMethod,
  BotApiResult,
  EditMessageReplyMarkupParams,
  EditMessageTextParams,
  SendMessageParams,
  SetMyCommandsParams,
  UnbanChatMemberParams,
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
 * тем же содержимым отвечают отказом 400, как Bot API; `failNext`, `throwNext`
 * и `failOn(метод)` действуют на один следующий вызов (он есть в журнале,
 * чат не меняется); `holdOn(метод)` держит такой вызов до `release`, `reached`
 * ждёт записи вызова — очередь без таймеров. Операции группы — журнал и `ok`, модели членства нет.
 *
 * @see memory-bot-api.test.ts
 */
export class MemoryBotApi implements BotApi {
  readonly journal: BotApiCall[] = [];
  private readonly chats = new Map<number, StoredMessage[]>();
  private planned: PlannedFailure | undefined;
  private readonly plannedOn = new Map<BotApiMethod, BotApiFailNext>();
  private readonly held = new Map<BotApiMethod, Promise<void>>();
  private watchers: {
    predicate: (journal: readonly BotApiCall[]) => boolean;
    resolve: () => void;
  }[] = [];

  /** Следующий вызов получит этот отказ. */
  failNext(failure: BotApiFailNext): void {
    this.planned = { kind: 'fail', failure };
  }

  /** Следующий вызов бросит (сбой транспорта). */
  throwNext(error: unknown = new Error(MEMORY_BOT_API_TEXTS.thrown)): void {
    this.planned = { kind: 'throw', error };
  }

  /** Следующий вызов этого метода получит отказ; вызовы других методов его не расходуют. */
  failOn(method: BotApiMethod, failure: BotApiFailNext): void {
    this.plannedOn.set(method, failure);
  }

  /** Следующий вызов этого метода ждёт возвращённого `release`; вызов уже в журнале. */
  holdOn(method: BotApiMethod): () => void {
    let release: () => void = () => undefined;
    this.held.set(
      method,
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    return release;
  }

  /**
   * Разрешается, когда журнал удовлетворяет условию: сразу, если уже так, иначе
   * при записи вызова, после которой оно стало истинным. Без таймеров.
   */
  reached(
    predicate: (journal: readonly BotApiCall[]) => boolean,
  ): Promise<void> {
    if (predicate(this.journal)) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this.watchers.push({ predicate, resolve });
    });
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

  async banChatMember(
    params: BanChatMemberParams,
  ): Promise<BotApiResult<unknown>> {
    return this.handle({ method: 'banChatMember', params }, MemoryBotApi.done);
  }

  async unbanChatMember(
    params: UnbanChatMemberParams,
  ): Promise<BotApiResult<unknown>> {
    return this.handle(
      { method: 'unbanChatMember', params },
      MemoryBotApi.done,
    );
  }

  async approveChatJoinRequest(
    params: ApproveChatJoinRequestParams,
  ): Promise<BotApiResult<unknown>> {
    return this.handle(
      { method: 'approveChatJoinRequest', params },
      MemoryBotApi.done,
    );
  }

  /** Запись в журнал, ожидание `release`, затем заданный сбой или обычный ответ. */
  private async handle(
    call: BotApiCall,
    answer: () => BotApiResult<unknown>,
  ): Promise<BotApiResult<unknown>> {
    this.journal.push(call);
    this.notify();
    const planned = this.takePlanned(call.method);
    const gate = this.held.get(call.method);
    if (gate !== undefined) {
      this.held.delete(call.method);
      await gate;
    }
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

  /** После записи в журнал: будит ожидающих `reached`, чьё условие выполнено. */
  private notify(): void {
    const ready = this.watchers.filter(({ predicate }) =>
      predicate(this.journal),
    );
    this.watchers = this.watchers.filter((watcher) => !ready.includes(watcher));
    for (const { resolve } of ready) resolve();
  }

  /** Сбой для вызова метода: свой `failOn`, иначе общий `failNext`/`throwNext`. */
  private takePlanned(method: BotApiMethod): PlannedFailure | undefined {
    const failure = this.plannedOn.get(method);
    if (failure !== undefined) {
      this.plannedOn.delete(method);
      return { kind: 'fail', failure };
    }
    const planned = this.planned;
    this.planned = undefined;
    return planned;
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
        entity.unix_time ?? null,
        entity.date_time_format ?? null,
      ]),
      stored.keyboard.map((row) =>
        row.map((button) => [
          button.text,
          'callback_data' in button ? button.callback_data : null,
          'disabled' in button,
          'style' in button ? (button.style ?? null) : null,
        ]),
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

  private static done(): BotApiResult<unknown> {
    return { ok: true, result: true };
  }

  private static badRequest(description: string): BotApiResult<unknown> {
    return { ok: false, error_code: 400, description };
  }
}
