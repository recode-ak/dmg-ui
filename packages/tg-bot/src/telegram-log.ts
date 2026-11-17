import type { ServerContext } from 'dmg-ui/server';
import type { BotApiMethod } from './bot-api/bot-api.types';
import type { BotApiFailure } from './bot-api/bot-api-failure';
import {
  TELEGRAM_CAPABILITIES,
  TELEGRAM_LIMITS,
} from './messenger/telegram.const';
import { LOG_SOURCE, LOG_TEXTS } from './telegram-log.const';
import type { TelegramOperation } from './telegram-log.types';

/**
 * Записи лога пакета Telegram (D-UI-61). В `meta` — имя мессенджера,
 * операция порта, метод Bot API, код отказа, описание сервера (до 200
 * знаков: текст Telegram без данных собеседника) и имя ошибки: ни id чата,
 * ни `message_id`, ни id нажатия, ни текста, подписей, `callback_data` и
 * текста броска (ERR-07). Успех и «not modified» не пишутся.
 */
export class TelegramLog {
  constructor(private readonly logger: ServerContext['logger']) {}

  /** Собеседник не целое положительное число: в группу или канал не пишем. */
  badPeer(operation: TelegramOperation): void {
    this.error(LOG_TEXTS.badPeer, { operation, reason: 'peer' });
  }

  badCallbackData(operation: TelegramOperation): void {
    this.error(LOG_TEXTS.badCallbackData, {
      operation,
      reason: 'callbackData',
    });
  }

  /** Handle не `message_id`: у `update` — откат новым сообщением (`warn`), у `retire` — отказ (`error`). */
  badHandle(operation: 'update' | 'retire'): void {
    const meta = { operation, reason: 'handle' };
    if (operation === 'update') this.warn(LOG_TEXTS.badHandle, meta);
    else this.error(LOG_TEXTS.badHandle, meta);
  }

  refused(method: BotApiMethod, failure: BotApiFailure): void {
    this.warn(LOG_TEXTS.refused, {
      method,
      error_code: failure.code(),
      description: failure.description(TELEGRAM_LIMITS.description),
    });
  }

  /** Бросок порта: имя ошибки без её текста. */
  failed(method: BotApiMethod, error: unknown): void {
    this.error(LOG_TEXTS.failed, {
      method,
      name: error instanceof Error ? error.name : typeof error,
    });
  }

  badResult(method: BotApiMethod): void {
    this.error(LOG_TEXTS.badResult, { method, reason: 'result' });
  }

  private warn(text: string, meta: Record<string, unknown>): void {
    this.logger.warn(LOG_SOURCE, text, this.meta(meta));
  }

  private error(text: string, meta: Record<string, unknown>): void {
    this.logger.error(LOG_SOURCE, text, this.meta(meta));
  }

  private meta(meta: Record<string, unknown>): Record<string, unknown> {
    return { messenger: TELEGRAM_CAPABILITIES.name, ...meta };
  }
}
