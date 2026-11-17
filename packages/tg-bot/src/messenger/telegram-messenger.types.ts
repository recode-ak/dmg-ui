import type { ServerContext } from 'dmg-ui/server';
import type { BotApi, MessageEntity } from '../bot-api/bot-api.types';
import type { BotApiFailure } from '../bot-api/bot-api-failure';

/** Сборка мессенджера Telegram: порт Bot API проекта и логгер. */
export type TelegramMessengerSpec = {
  readonly api: BotApi;
  readonly logger: ServerContext['logger'];
};

/** Текст Bot API: видимый текст и сущности (смещения — UTF-16). */
export type TelegramContent = {
  readonly text: string;
  readonly entities: readonly MessageEntity[];
};

/** Итог вызова порта: ответ, отказ Bot API или сбой (бросок, ответ не по схеме). */
export type BotApiOutcome =
  | { readonly kind: 'done'; readonly result: unknown }
  | { readonly kind: 'refused'; readonly failure: BotApiFailure }
  | { readonly kind: 'failed' };
