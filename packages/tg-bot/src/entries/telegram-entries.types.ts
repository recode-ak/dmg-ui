import type { AnyUiAppDef } from 'dmg-ui';
import type { ChatEntryPointSpec } from 'dmg-ui/chat-ui';
import type { ServerContext } from 'dmg-ui/server';
import type { BotApi } from '../bot-api/bot-api.types';
import type { TELEGRAM_VIA } from './telegram-entries.const';

/** Способ точки входа Telegram. */
export type TelegramVia = (typeof TELEGRAM_VIA)[keyof typeof TELEGRAM_VIA];

/** Сборка меню команд: порт Bot API, логгер, приложение (названия входов) и точки входа проекта. */
export type TelegramMenuSpec = {
  readonly api: BotApi;
  readonly logger: ServerContext['logger'];
  readonly app: AnyUiAppDef;
  readonly entryPoints: readonly ChatEntryPointSpec[];
};
