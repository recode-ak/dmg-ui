// Порт Bot API (D-UI-61): узкое подмножество методов и полей Telegram Bot API,
// параметры — JSON Bot API как есть (snake_case). Реализацию на библиотеке
// или на сети даёт проект; отказ Bot API — значение, бросок — сбой транспорта.

/** Вид сущности текста: стили идут сущностями, разметки в тексте пакет не шлёт. */
export type MessageEntityType =
  | 'bold'
  | 'italic'
  | 'strikethrough'
  | 'code'
  | 'pre'
  | 'blockquote'
  | 'text_link'
  | 'date_time';

/**
 * Сущность текста: смещение и длина — единицы UTF-16; `url` — только у
 * `text_link`; `unix_time` (секунды Unix) и `date_time_format` — только у
 * `date_time` (Bot API 9.5; формат `r|w?[dD]?[tT]?`).
 */
export type MessageEntity = {
  readonly type: MessageEntityType;
  readonly offset: number;
  readonly length: number;
  readonly url?: string;
  readonly unix_time?: number;
  readonly date_time_format?: string;
};

/** Цвет кнопки (Bot API 9.4). */
export type ButtonStyle = 'primary' | 'success' | 'danger';

/** Кнопка с данными нажатия (1–64 байта UTF-8) и необязательным цветом. */
export type CallbackButton = {
  readonly text: string;
  readonly callback_data: string;
  readonly style?: ButtonStyle;
};

/**
 * Отключённая кнопка (Bot API 10.3): `disabled` — пустой объект. Допущение:
 * без `callback_data` и `style`, на странице Bot API не подтверждено —
 * допущения D-UI-67 (проверка на тестовом боте).
 */
export type DisabledButton = {
  readonly text: string;
  readonly disabled: Record<string, never>;
};

/** Кнопка инлайн-клавиатуры: нажимаемая или отключённая. */
export type InlineKeyboardButton = CallbackButton | DisabledButton;

/** Инлайн-клавиатура: строки кнопок; пустая — клавиатуры нет. */
export type InlineKeyboardMarkup = {
  readonly inline_keyboard: readonly (readonly InlineKeyboardButton[])[];
};

/** Предпросмотр ссылок. */
export type LinkPreviewOptions = { readonly is_disabled?: boolean };

/** `chat_id` — число: строку Bot API понял бы как имя публичного канала. */
export type SendMessageParams = {
  readonly chat_id: number;
  readonly text: string;
  readonly entities?: readonly MessageEntity[];
  readonly reply_markup?: InlineKeyboardMarkup;
  readonly link_preview_options?: LinkPreviewOptions;
};

/** Правка текста; без `reply_markup` Bot API снимает клавиатуру. */
export type EditMessageTextParams = {
  readonly chat_id: number;
  readonly message_id: number;
  readonly text: string;
  readonly entities?: readonly MessageEntity[];
  readonly reply_markup?: InlineKeyboardMarkup;
  readonly link_preview_options?: LinkPreviewOptions;
};

/** Правка клавиатуры; без `reply_markup` клавиатура снята. */
export type EditMessageReplyMarkupParams = {
  readonly chat_id: number;
  readonly message_id: number;
  readonly reply_markup?: InlineKeyboardMarkup;
};

/** Ответ на нажатие; без `text` — без подсказки. */
export type AnswerCallbackQueryParams = {
  readonly callback_query_id: string;
  readonly text?: string;
};

/** Команда бота: имя `[a-z0-9_]{1,32}` и описание 1–256 знаков. */
export type BotCommand = {
  readonly command: string;
  readonly description: string;
};

/** Область меню команд, JSON Bot API как есть; пакет задаёт `all_private_chats` (в группах бот на команды молчит). */
export type BotCommandScope = { readonly type: 'all_private_chats' };

/** Список команд меню; `language_code` пакет не задаёт. */
export type SetMyCommandsParams = {
  readonly commands: readonly BotCommand[];
  readonly scope?: BotCommandScope;
};

/** Бан участника; `until_date` — секунды Unix, меньше 30 с или больше 366 дней от сейчас — навсегда. */
export type BanChatMemberParams = {
  readonly chat_id: number;
  readonly user_id: number;
  readonly until_date?: number;
};

/** Снятие бана; `only_if_banned` — не трогать участника, который не в бане (без него Bot API удалит его из группы). */
export type UnbanChatMemberParams = {
  readonly chat_id: number;
  readonly user_id: number;
  readonly only_if_banned?: boolean;
};

/** Принятие заявки на вступление: нужно право бота `can_invite_users`. */
export type ApproveChatJoinRequestParams = {
  readonly chat_id: number;
  readonly user_id: number;
};

/** Отказ Bot API: код и описание сервера. */
export type BotApiRefusal = {
  readonly ok: false;
  readonly error_code: number;
  /** Только `description` из JSON ответа Telegram (уходит в лог); сбой транспорта — бросок, не отказ. */
  readonly description: string;
  /** `migrate_to_chat_id` — группа стала супергруппой: новый id пакет не читает дальше факта. */
  readonly parameters?: {
    readonly retry_after?: number;
    readonly migrate_to_chat_id?: number;
  };
};

/** Ответ Bot API; `result` пакет сверяет схемой — транспорту не верит. */
export type BotApiResult<T> =
  | { readonly ok: true; readonly result: T }
  | BotApiRefusal;

/** Порт Bot API: по методу на операцию; бросок — сбой транспорта, пакет его ловит. */
export type BotApi = {
  sendMessage(params: SendMessageParams): Promise<BotApiResult<unknown>>;
  editMessageText(
    params: EditMessageTextParams,
  ): Promise<BotApiResult<unknown>>;
  editMessageReplyMarkup(
    params: EditMessageReplyMarkupParams,
  ): Promise<BotApiResult<unknown>>;
  answerCallbackQuery(
    params: AnswerCallbackQueryParams,
  ): Promise<BotApiResult<unknown>>;
  setMyCommands(params: SetMyCommandsParams): Promise<BotApiResult<unknown>>;
  banChatMember(params: BanChatMemberParams): Promise<BotApiResult<unknown>>;
  unbanChatMember(
    params: UnbanChatMemberParams,
  ): Promise<BotApiResult<unknown>>;
  approveChatJoinRequest(
    params: ApproveChatJoinRequestParams,
  ): Promise<BotApiResult<unknown>>;
};

/** Имя метода порта — для лога и журнала. */
export type BotApiMethod = keyof BotApi;
