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
  /**
   * Описания зарезервированных команд беседы (D-UI-127): команда с описанием
   * публикуется после команд точек `menu` в порядке `RESERVED_COMMANDS`, без
   * описания — нет (D-UI-107: `/help` по умолчанию не публикуется). Описание
   * — 1–256 знаков, с ними команд — не больше `MENU_LIMITS.commands`, иначе
   * бросок сборки.
   */
  readonly reserved?: {
    readonly cancel?: string;
    readonly back?: string;
    readonly help?: string;
    readonly link?: string;
  };
};
