import { TELEGRAM_ALLOWED_UPDATES } from 'dmg-ui/tg-bot';
import { Bot, GrammyError } from 'grammy';
import { GrammyBotApi } from './grammy-bot-api';
import type {
  BotIdentity,
  GrammyPollingSpec,
  PollingConnection,
  UpdateTarget,
} from './grammy-polling.types';

/**
 * Опрос `getUpdates` на grammy (D-UI-68): `getMe`, подача каждого апдейта
 * одним обработчиком в приёмник, остановка. Порт не открывается: подлинность
 * апдейта держат токен и TLS. `Bot.start` снимает вебхук бота. Ошибка
 * обработки — запись без токена, текста и контекста.
 */
export class GrammyPolling {
  private readonly bot: Bot;
  private readonly logger: GrammyPollingSpec['logger'];

  constructor(spec: GrammyPollingSpec) {
    this.bot = spec.bot;
    this.logger = spec.logger;
  }

  /** Бот по токену: опрос и порт Bot API на одном клиенте библиотеки; вход библиотеку не импортирует. */
  static connect(
    token: string,
    logger: GrammyPollingSpec['logger'],
  ): PollingConnection {
    const bot = new Bot(token);
    return {
      polling: new GrammyPolling({ bot, logger }),
      api: new GrammyBotApi(bot.api),
    };
  }

  /** Конфликт `getUpdates` (409): на этом токене работает ещё один исполнитель. */
  static isConflict(error: unknown): boolean {
    return error instanceof GrammyError && error.error_code === 409;
  }

  /** Бот по `getMe`: id и имя; сбой запроса — бросок библиотеки. */
  async identify(): Promise<BotIdentity> {
    const me = await this.bot.api.getMe();
    this.bot.botInfo = me;
    return { id: me.id, username: me.username };
  }

  /** Опрос до остановки: разрешается после `stop` или бросает фатальную ошибку (401, 409). */
  async start(target: UpdateTarget): Promise<void> {
    this.bot.use(async (ctx) => {
      await target.receive(ctx.update);
    });
    this.bot.catch((failure) => {
      this.logger.error('GrammyPolling', 'сбой обработки апдейта', {
        error: failure.error instanceof Error ? failure.error.name : 'unknown',
      });
    });
    await this.bot.start({ allowed_updates: [...TELEGRAM_ALLOWED_UPDATES] });
  }

  /** Останавливает опрос; безопасно без `start` и повторно. */
  async stop(): Promise<void> {
    try {
      await this.bot.stop();
    } catch {
      this.logger.warn('GrammyPolling', 'остановка опроса не подтверждена');
    }
  }
}
