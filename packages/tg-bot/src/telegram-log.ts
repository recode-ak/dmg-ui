import type { ConversationSignal } from 'dmg-ui/chat-ui';
import type { ServerContext } from 'dmg-ui/server';
import type { BotApiMethod } from './bot-api/bot-api.types';
import type { BotApiFailure } from './bot-api/bot-api-failure';
import {
  TELEGRAM_CAPABILITIES,
  TELEGRAM_LIMITS,
} from './messenger/telegram.const';
import { LOG_SOURCE, LOG_TEXTS } from './telegram-log.const';
import type { TelegramOperation } from './telegram-log.types';
import type { RefusedUpdate } from './updates/telegram-updates.types';

/**
 * Записи лога пакета Telegram (D-UI-61). В `meta` — имя мессенджера,
 * операция порта, метод Bot API, код отказа, описание сервера (до 200
 * знаков: текст Telegram без данных собеседника), причина отказа и вид апдейта,
 * вид сигнала и имя ошибки: ни id чата и человека, ни `message_id`, ни id
 * нажатия, ни текста, подписей, `callback_data`, `file_id` и текста броска
 * (ERR-07). Успех, «not modified» и апдейт вне диалога не пишутся.
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

  refused(
    method: BotApiMethod,
    failure: BotApiFailure,
    operation?: TelegramOperation,
  ): void {
    this.warn(LOG_TEXTS.refused, {
      ...TelegramLog.operation(operation),
      method,
      error_code: failure.code(),
      description: failure.description(TELEGRAM_LIMITS.description),
    });
  }

  /** Бросок порта: имя ошибки без её текста. */
  failed(
    method: BotApiMethod,
    error: unknown,
    operation?: TelegramOperation,
  ): void {
    this.error(LOG_TEXTS.failed, {
      ...TelegramLog.operation(operation),
      method,
      name: TelegramLog.nameOf(error),
    });
  }

  badResult(method: BotApiMethod, operation?: TelegramOperation): void {
    this.error(LOG_TEXTS.badResult, {
      ...TelegramLog.operation(operation),
      method,
      reason: 'result',
    });
  }

  /** Апдейт отвергнут: не по схеме или нарушает допуск диалога; вид апдейта — если известен. */
  refusedUpdate({ reason, update }: RefusedUpdate): void {
    const text =
      reason === 'schema' ? LOG_TEXTS.badUpdate : LOG_TEXTS.refusedUpdate;
    this.warn(text, update === undefined ? { reason } : { reason, update });
  }

  /** Узел бесед бросил: вид сигнала и имя ошибки без её текста. */
  signalFailed(kind: ConversationSignal['kind'], error: unknown): void {
    this.error(LOG_TEXTS.signalFailed, {
      signal: kind,
      name: TelegramLog.nameOf(error),
    });
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

  private static operation(
    operation: TelegramOperation | undefined,
  ): Record<string, unknown> {
    return operation === undefined ? {} : { operation };
  }

  private static nameOf(error: unknown): string {
    return error instanceof Error ? error.name : typeof error;
  }
}
