import type { ServerContext } from 'dmg-ui/server';
import type { BotApi } from 'dmg-ui/tg-bot';

/** Сборка узла примера (D-UI-68): порт Bot API, id и имя бота, допущенные люди, шина, логгер и каталог данных. */
export type ExampleBotSpec = {
  readonly api: BotApi;
  /** id самого бота (`getMe`). */
  readonly bot: number;
  /** Имя бота (`getMe`): из него — ссылки на экран `t.me/<имя>?start=<код>` (D-UI-127). */
  readonly username: string;
  /** id Telegram: первый — пользователь A, второй — B. */
  readonly users: readonly number[];
  readonly logger: ServerContext['logger'];
  readonly bus: ServerContext['bus'];
  /** Каталог данных учебного мира (задачи, лог операций). */
  readonly dataDir: string;
};
