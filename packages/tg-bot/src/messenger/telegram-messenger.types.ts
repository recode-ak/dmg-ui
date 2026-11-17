import type { ServerContext } from 'dmg-ui/server';
import type { BotApi, MessageEntity } from '../bot-api/bot-api.types';

/** Сборка мессенджера Telegram: порт Bot API проекта, логгер и часы (мс; по умолчанию `Date.now`). */
export type TelegramMessengerSpec = {
  readonly api: BotApi;
  readonly logger: ServerContext['logger'];
  readonly now?: () => number;
};

/** Текст Bot API: видимый текст и сущности (смещения — UTF-16). */
export type TelegramContent = {
  readonly text: string;
  readonly entities: readonly MessageEntity[];
};
