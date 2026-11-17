import type { CommunitySignal, ConversationSignal } from 'dmg-ui/chat-ui';
import type { TelegramMessenger } from '../messenger/telegram-messenger';
import { TelegramLog } from '../telegram-log';
import { TelegramSignals } from './telegram-signals';
import type {
  RefusedUpdate,
  SignalOutcome,
  TelegramUpdatesSpec,
} from './telegram-updates.types';

/**
 * Приём апдейтов Telegram (D-UI-62): личность держится на подлинности
 * апдейта (проект подаёт только апдейты от Telegram). Нажатие, которое
 * отвергнуто, получает один ответ без текста и `warn`. `receive` не бросает
 * (ERR-01): бросок узла бесед или сообщества — `error` с видом сигнала и
 * именем ошибки, без данных (ERR-07).
 */
export class TelegramUpdates {
  private readonly conversations: TelegramUpdatesSpec['conversations'];
  private readonly messenger: TelegramMessenger;
  private readonly log: TelegramLog;
  private readonly signals: TelegramSignals;
  private readonly communities: TelegramUpdatesSpec['communities'];

  constructor(spec: TelegramUpdatesSpec) {
    this.conversations = spec.conversations;
    this.messenger = spec.messenger;
    this.log = new TelegramLog(spec.logger);
    this.signals = new TelegramSignals(spec);
    this.communities = spec.communities;
  }

  async receive(update: unknown): Promise<void> {
    const outcome = this.translate(update);
    switch (outcome.kind) {
      case 'signal':
        return this.deliver(outcome.signal);
      case 'community':
        return this.deliverCommunity(outcome.signal);
      case 'refused':
        return this.refuse(outcome);
      case 'wrongBot':
        this.log.wrongBot();
        return;
      case 'ignored':
        return;
      default:
        outcome satisfies never;
        return;
    }
  }

  /** Перевод апдейта; бросок (геттер чужого объекта) — отказ `schema` без данных. */
  private translate(update: unknown): SignalOutcome {
    try {
      return this.signals.of(update);
    } catch {
      return { kind: 'refused', reason: 'schema' };
    }
  }

  private async deliver(signal: ConversationSignal): Promise<void> {
    try {
      await this.conversations.receive(signal);
    } catch (error) {
      this.log.signalFailed(signal.kind, error);
    }
  }

  /** Сигнал сообщества — в его приём; приёма нет — «ничего» без записи; бросок — запись с видом сигнала. */
  private async deliverCommunity(signal: CommunitySignal): Promise<void> {
    if (this.communities === undefined) return;
    try {
      await this.communities.receive(signal);
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
