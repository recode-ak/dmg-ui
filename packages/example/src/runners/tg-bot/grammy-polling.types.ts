import type { ServerContext } from 'dmg-ui/server';
import type { BotApi } from 'dmg-ui/tg-bot';
import type { Bot } from 'grammy';
import type { GrammyPolling } from './grammy-polling';

/** Сборка опроса: бот библиотеки и логгер. */
export type GrammyPollingSpec = {
  readonly bot: Bot;
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
