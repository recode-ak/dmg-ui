import type { ServerContext } from 'dmg-ui/server';
import type { BotApi } from 'dmg-ui/tg-bot';

/** Сборка узла примера (D-UI-68): порт Bot API, id бота, допущенные люди, шина, логгер и каталог данных. */
export type ExampleBotSpec = {
  readonly api: BotApi;
  /** id самого бота (`getMe`). */
  readonly bot: number;
  /** id Telegram: первый — пользователь A, второй — B. */
  readonly users: readonly number[];
  readonly logger: ServerContext['logger'];
  readonly bus: ServerContext['bus'];
  /** Каталог данных учебного мира (задачи, лог операций). */
  readonly dataDir: string;
};
