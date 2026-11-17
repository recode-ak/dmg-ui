import type { ServerContext } from 'dmg-ui/server';
import type { BotApi } from 'dmg-ui/tg-bot';

/** Проба Bot API: id (кириллическая «Е» и номер), что смотреть в чате и что ожидается. */
export type ProbeCase = {
  readonly id: string;
  readonly look: string;
  readonly expected: string;
};

/** Сборка пробы: порт Bot API, чат человека (id Telegram) и логгер. */
export type ExampleProbeSpec = {
  readonly api: BotApi;
  readonly chat: number;
  readonly logger: ServerContext['logger'];
};

/** Итог пробы: сколько операций доставлено и сколько нет. */
export type ProbeResult = {
  readonly id: string;
  readonly sent: number;
  readonly failed: number;
};
