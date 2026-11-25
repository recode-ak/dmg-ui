import type { ServerContext } from 'dmg-ui/server';
import type { BotApi } from 'dmg-ui/tg-bot';

/** Сборка трассы: обёрнутый порт, путь файла (нет — трассы нет) и логгер. */
export type TracingBotApiSpec = {
  readonly api: BotApi;
  readonly path?: string;
  readonly logger: ServerContext['logger'];
};
