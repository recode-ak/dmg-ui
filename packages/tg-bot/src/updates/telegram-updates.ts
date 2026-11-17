import type { ConversationSignal } from 'dmg-ui/chat-ui';
import type { TelegramMessenger } from '../messenger/telegram-messenger';
import { TelegramLog } from '../telegram-log';
import { TelegramSignals } from './telegram-signals';
import type {
  RefusedUpdate,
  TelegramUpdatesSpec,
} from './telegram-updates.types';

/**
 * Приём апдейтов Telegram (D-UI-62): проект подаёт апдейт Bot API как есть,
 * сигнал беседы уходит в узел бесед — он и отвечает на нажатие. Отвергнутое
 * нажатие (чужой чат, чужой человек, инлайн-режим, без `data`, не по схеме)
 * получает ровно один ответ без текста через мессенджер, сигнала нет; отказ —
 * `warn` с причиной. Апдейт вне диалога — ничего, без записи. `receive` не
 * бросает (ERR-01): бросок узла бесед — `error` с видом сигнала и именем
 * ошибки, без данных (ERR-07).
 */
export class TelegramUpdates {
  private readonly conversations: TelegramUpdatesSpec['conversations'];
  private readonly messenger: TelegramMessenger;
  private readonly log: TelegramLog;

  constructor(spec: TelegramUpdatesSpec) {
    this.conversations = spec.conversations;
    this.messenger = spec.messenger;
    this.log = new TelegramLog(spec.logger);
  }

  async receive(update: unknown): Promise<void> {
    const outcome = TelegramSignals.of(update);
    switch (outcome.kind) {
      case 'signal':
        return this.deliver(outcome.signal);
      case 'refused':
        return this.refuse(outcome);
      case 'ignored':
        return;
      default:
        outcome satisfies never;
        return;
    }
  }

  private async deliver(signal: ConversationSignal): Promise<void> {
    try {
      await this.conversations.receive(signal);
    } catch (error) {
      this.log.signalFailed(signal.kind, error);
    }
  }

  /** Отказ в лог; у нажатия — ответ без текста: тексты беседы даёт узел бесед. */
  private async refuse(outcome: RefusedUpdate): Promise<void> {
    this.log.refusedUpdate(outcome.reason);
    if (outcome.press !== undefined) {
      await this.messenger.answerPress(outcome.press);
    }
  }
}
