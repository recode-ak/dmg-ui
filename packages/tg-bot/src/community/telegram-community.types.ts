import type { BotApi } from '../bot-api/bot-api.types';
import type { BotApiCaller } from '../bot-api/bot-api-caller';
import type { TelegramLog } from '../telegram-log';

/** Сборка операций группы: порт Bot API, общий вызыватель порта, лог и часы (мс). */
export type TelegramCommunitySpec = {
  readonly api: BotApi;
  readonly caller: BotApiCaller;
  readonly log: TelegramLog;
  readonly now: () => number;
};

/** Адрес операции: id группы (< 0) и участника (> 0) числами. */
export type CommunityTarget = {
  readonly chat_id: number;
  readonly user_id: number;
};
