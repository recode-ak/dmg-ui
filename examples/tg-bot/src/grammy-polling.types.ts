import type { ServerContext } from 'dmg-ui/server';
import type { BotApi } from 'dmg-ui/tg-bot';
import type { GrammyPolling } from './grammy-polling';

/** Сборка опроса: бот библиотеки (тип задаёт `GrammyPolling`, файл типов библиотеку не видит) и логгер. */
export type GrammyPollingSpec<B> = {
  readonly bot: B;
  readonly logger: ServerContext['logger'];
};

/** Бот по `getMe`: id (для приёма апдейтов) и имя (для консоли). */
export type BotIdentity = {
  readonly id: number;
  readonly username: string;
};

/** Приёмник апдейтов: `ExampleBot.receive`. */
export type UpdateTarget = {
  receive(update: unknown): Promise<void>;
};

/** Опрос и порт Bot API, собранные по токену на одном клиенте. */
export type PollingConnection = {
  readonly polling: GrammyPolling;
  readonly api: BotApi;
};
