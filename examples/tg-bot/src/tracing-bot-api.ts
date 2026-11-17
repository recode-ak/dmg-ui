import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
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
import type { TracingBotApiSpec } from './tracing-bot-api.types';

/**
 * Трасса исходящих вызовов (D-UI-68): декоратор порта, по строке JSONL на
 * вызов — метод, параметры, итог. Путь не задан — вызовы идут как есть.
 * Тексты и id людей — только в файл, не в логгер (ERR-07); сбой записи —
 * `warn` без данных, вызов не ломает.
 */
export class TracingBotApi implements BotApi {
  private readonly api: BotApi;
  private readonly path: string | undefined;
  private readonly logger: TracingBotApiSpec['logger'];

  constructor(spec: TracingBotApiSpec) {
    this.api = spec.api;
    this.path = spec.path;
    this.logger = spec.logger;
  }

  sendMessage(params: SendMessageParams): Promise<BotApiResult<unknown>> {
    return this.traced('sendMessage', params, () =>
      this.api.sendMessage(params),
    );
  }

  editMessageText(
    params: EditMessageTextParams,
  ): Promise<BotApiResult<unknown>> {
    return this.traced('editMessageText', params, () =>
      this.api.editMessageText(params),
    );
  }

  editMessageReplyMarkup(
    params: EditMessageReplyMarkupParams,
  ): Promise<BotApiResult<unknown>> {
    return this.traced('editMessageReplyMarkup', params, () =>
      this.api.editMessageReplyMarkup(params),
    );
  }

  answerCallbackQuery(
    params: AnswerCallbackQueryParams,
  ): Promise<BotApiResult<unknown>> {
    return this.traced('answerCallbackQuery', params, () =>
      this.api.answerCallbackQuery(params),
    );
  }

  setMyCommands(params: SetMyCommandsParams): Promise<BotApiResult<unknown>> {
    return this.traced('setMyCommands', params, () =>
      this.api.setMyCommands(params),
    );
  }

  banChatMember(params: BanChatMemberParams): Promise<BotApiResult<unknown>> {
    return this.traced('banChatMember', params, () =>
      this.api.banChatMember(params),
    );
  }

  unbanChatMember(
    params: UnbanChatMemberParams,
  ): Promise<BotApiResult<unknown>> {
    return this.traced('unbanChatMember', params, () =>
      this.api.unbanChatMember(params),
    );
  }

  approveChatJoinRequest(
    params: ApproveChatJoinRequestParams,
  ): Promise<BotApiResult<unknown>> {
    return this.traced('approveChatJoinRequest', params, () =>
      this.api.approveChatJoinRequest(params),
    );
  }

  /** Вызов порта и запись до возврата; бросок порта идёт наружу как есть. */
  private async traced(
    method: BotApiMethod,
    params: object,
    call: () => Promise<BotApiResult<unknown>>,
  ): Promise<BotApiResult<unknown>> {
    const outcome = await call();
    await this.write({
      method,
      params,
      ok: outcome.ok,
      ...(outcome.ok ? {} : { error_code: outcome.error_code }),
    });
    return outcome;
  }

  private async write(line: object): Promise<void> {
    if (this.path === undefined) return;
    try {
      await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
      await appendFile(this.path, `${JSON.stringify(line)}\n`, {
        mode: 0o600,
      });
    } catch {
      this.logger.warn('TracingBotApi', 'трасса не записана');
    }
  }
}
