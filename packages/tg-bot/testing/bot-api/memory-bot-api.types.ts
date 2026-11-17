import type {
  AnswerCallbackQueryParams,
  EditMessageReplyMarkupParams,
  EditMessageTextParams,
  InlineKeyboardButton,
  MessageEntity,
  SendMessageParams,
  SetMyCommandsParams,
} from 'dmg-ui/tg-bot';

/** Запись журнала подставного порта: метод и параметры как есть. */
export type BotApiCall =
  | { readonly method: 'sendMessage'; readonly params: SendMessageParams }
  | {
      readonly method: 'editMessageText';
      readonly params: EditMessageTextParams;
    }
  | {
      readonly method: 'editMessageReplyMarkup';
      readonly params: EditMessageReplyMarkupParams;
    }
  | {
      readonly method: 'answerCallbackQuery';
      readonly params: AnswerCallbackQueryParams;
    }
  | {
      readonly method: 'setMyCommands';
      readonly params: SetMyCommandsParams;
    };

/** Отказ, который получит следующий вызов. */
export type BotApiFailNext = {
  readonly error_code: number;
  readonly description: string;
  readonly parameters?: { readonly retry_after?: number };
};

/** Сообщение чата глазами собеседника: последнее содержимое и число правок. */
export type BotChatLine = {
  readonly message_id: number;
  readonly text: string;
  readonly entities: readonly MessageEntity[];
  /** Строки кнопок; пусто — клавиатуры нет. */
  readonly keyboard: readonly (readonly InlineKeyboardButton[])[];
  readonly edits: number;
};

/** Сбой, заданный на следующий вызов. */
export type PlannedFailure =
  | { readonly kind: 'fail'; readonly failure: BotApiFailNext }
  | { readonly kind: 'throw'; readonly error: unknown };

/** Сообщение чата, которое правят на месте. */
export type StoredMessage = {
  message_id: number;
  text: string;
  entities: readonly MessageEntity[];
  keyboard: readonly (readonly InlineKeyboardButton[])[];
  edits: number;
};
