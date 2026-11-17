import type { ConversationSignal } from 'dmg-ui/chat-ui';
import type { TelegramMessenger } from '../messenger/telegram-messenger';
import { TelegramLog } from '../telegram-log';
import { TelegramSignals } from './telegram-signals';
import type {
  RefusedUpdate,
  TelegramUpdatesSpec,
} from './telegram-updates.types';

/**
 * Приём апдейтов Telegram (D-UI-62). Личность держится на подлинности апдейта:
 * проект подаёт только апдейты от Telegram (getUpdates или вебхук с секретным
 * токеном). Отвергнутое нажатие получает ровно один ответ без текста, затем
 * `warn` с причиной. `receive` не бросает (ERR-01): бросок узла бесед —
 * `error` с видом сигнала и именем ошибки, без данных (ERR-07).
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

  /** У нажатия — сначала ответ без текста (тексты беседы даёт узел бесед), затем отказ в лог. */
  private async refuse(outcome: RefusedUpdate): Promise<void> {
    if (outcome.press !== undefined) {
      await this.messenger.answerPress(outcome.press);
    }
    this.log.refusedUpdate(outcome);
  }
}
