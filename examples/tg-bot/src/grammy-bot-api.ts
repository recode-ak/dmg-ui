import type {
  AnswerCallbackQueryParams,
  ApproveChatJoinRequestParams,
  BanChatMemberParams,
  BotApi,
  BotApiRefusal,
  BotApiResult,
  EditMessageReplyMarkupParams,
  EditMessageTextParams,
  SendMessageParams,
  SetMyCommandsParams,
  UnbanChatMemberParams,
} from 'dmg-ui/tg-bot';
import { Api, GrammyError } from 'grammy';

/**
 * Порт Bot API на grammy (D-UI-68) — единственное место адаптера. Метод порта —
 * строка `api.raw.<метод>(params)`. Отказ Telegram — значение с полями только
 * из ответа; любой иной сбой — бросок с фиксированным текстом без причины:
 * в исходной ошибке бывает адрес с токеном.
 */
export class GrammyBotApi implements BotApi {
  private static readonly TRANSPORT_FAILURE = 'сбой транспорта Bot API';

  constructor(private readonly api: Api) {}

  /** Адаптер по токену: для входов, которые саму библиотеку не импортируют. */
  static fromToken(token: string): GrammyBotApi {
    return new GrammyBotApi(new Api(token));
  }

  sendMessage(params: SendMessageParams): Promise<BotApiResult<unknown>> {
    return GrammyBotApi.call(() =>
      this.api.raw.sendMessage(GrammyBotApi.wire(params)),
    );
  }

  editMessageText(
    params: EditMessageTextParams,
  ): Promise<BotApiResult<unknown>> {
    return GrammyBotApi.call(() =>
      this.api.raw.editMessageText(GrammyBotApi.wire(params)),
    );
  }

  editMessageReplyMarkup(
    params: EditMessageReplyMarkupParams,
  ): Promise<BotApiResult<unknown>> {
    return GrammyBotApi.call(() =>
      this.api.raw.editMessageReplyMarkup(GrammyBotApi.wire(params)),
    );
  }

  answerCallbackQuery(
    params: AnswerCallbackQueryParams,
  ): Promise<BotApiResult<unknown>> {
    return GrammyBotApi.call(() =>
      this.api.raw.answerCallbackQuery(GrammyBotApi.wire(params)),
    );
  }

  setMyCommands(params: SetMyCommandsParams): Promise<BotApiResult<unknown>> {
    return GrammyBotApi.call(() =>
      this.api.raw.setMyCommands(GrammyBotApi.wire(params)),
    );
  }

  banChatMember(params: BanChatMemberParams): Promise<BotApiResult<unknown>> {
    return GrammyBotApi.call(() =>
      this.api.raw.banChatMember(GrammyBotApi.wire(params)),
    );
  }

  unbanChatMember(
    params: UnbanChatMemberParams,
  ): Promise<BotApiResult<unknown>> {
    return GrammyBotApi.call(() =>
      this.api.raw.unbanChatMember(GrammyBotApi.wire(params)),
    );
  }

  approveChatJoinRequest(
    params: ApproveChatJoinRequestParams,
  ): Promise<BotApiResult<unknown>> {
    return GrammyBotApi.call(() =>
      this.api.raw.approveChatJoinRequest(GrammyBotApi.wire(params)),
    );
  }

  /** Единственное приведение типа: у типов grammy нет `disabled` у кнопки, а поля идут как есть. */
  private static wire(params: object): never {
    return params as never;
  }

  private static async call(
    request: () => Promise<unknown>,
  ): Promise<BotApiResult<unknown>> {
    try {
      return { ok: true, result: await request() };
    } catch (error) {
      if (error instanceof GrammyError) return GrammyBotApi.refusal(error);
      throw new Error(GrammyBotApi.TRANSPORT_FAILURE);
    }
  }

  /** Поля — из ответа Telegram; `message` и `payload` ошибки не читаются. */
  private static refusal(error: GrammyError): BotApiRefusal {
    const { retry_after, migrate_to_chat_id } = error.parameters;
    const parameters = {
      ...(retry_after !== undefined ? { retry_after } : {}),
      ...(migrate_to_chat_id !== undefined ? { migrate_to_chat_id } : {}),
    };
    return {
      ok: false,
      error_code: error.error_code,
      description: error.description,
      ...(Object.keys(parameters).length > 0 ? { parameters } : {}),
    };
  }
}
