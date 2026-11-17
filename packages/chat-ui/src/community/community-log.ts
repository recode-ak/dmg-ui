import type { ServerContext } from 'dmg-ui/server';
import { LOG_SOURCE } from '../messenger/messenger.const';
import type {
  CommunityOperation,
  CommunitySignalKind,
  UndeliveredReason,
} from '../messenger/messenger.types';
import type { ReactionCause } from './communities.types';
import { COMMUNITY_TEXTS } from './community.const';

/**
 * Записи лога исполнителя сообщества. В `meta` — имя мессенджера, вид
 * сигнала или `id` узла реакции, событие, причина, код отказа и имя ошибки:
 * ни handle, ни личности, ни uuid, ни ключа, ни id сигнала, ни payload, ни
 * текста броска (ERR-07). Успех не пишется.
 */
export class CommunityLog {
  constructor(
    private readonly logger: ServerContext['logger'],
    private readonly messenger: string,
  ) {}

  /** Сигнал отвергнут по пределу длины. */
  rejected(
    kind: CommunitySignalKind,
    reason: 'signalId' | 'community' | 'member',
  ): void {
    this.warn(COMMUNITY_TEXTS.rejected, { kind, reason });
  }

  /** Сообщества нет у домена (`keys` → `undefined`). */
  unknownCommunity(kind: CommunitySignalKind): void {
    this.warn(COMMUNITY_TEXTS.unknownCommunity, {
      kind,
      reason: 'unknownCommunity',
    });
  }

  /** Человека нет у домена, манифест незнакомых не принимает. */
  stranger(kind: CommunitySignalKind): void {
    this.warn(COMMUNITY_TEXTS.stranger, { kind, reason: 'stranger' });
  }

  signalRefused(kind: CommunitySignalKind, code: string): void {
    this.warn(COMMUNITY_TEXTS.signalRefused, { kind, code });
  }

  /** Бросок порта перевода или бэкенда UC: имя ошибки без её текста. */
  signalFailed(kind: CommunitySignalKind, error: unknown): void {
    this.error(COMMUNITY_TEXTS.signalFailed, {
      kind,
      name: CommunityLog.nameOf(error),
    });
  }

  /** Цель реакции пропущена: строка не по форме, строк сверх предела, нет handle или личности. */
  skipped(
    cause: ReactionCause,
    reason: 'target' | 'targets' | 'noHandle' | 'noMember',
  ): void {
    this.warn(COMMUNITY_TEXTS[reason], { ...cause, reason });
  }

  reactionRefused(cause: ReactionCause, code: string): void {
    this.warn(COMMUNITY_TEXTS.reactionRefused, { ...cause, code });
  }

  undelivered(
    cause: ReactionCause,
    operation: CommunityOperation,
    reason: UndeliveredReason,
  ): void {
    this.warn(COMMUNITY_TEXTS.undelivered, { ...cause, operation, reason });
  }

  /** Бросок UC, порта перевода или порта сообщества (тогда с операцией): имя ошибки без её текста. */
  reactionFailed(
    cause: ReactionCause,
    error: unknown,
    operation?: CommunityOperation,
  ): void {
    this.error(COMMUNITY_TEXTS.reactionFailed, {
      ...cause,
      ...(operation === undefined ? {} : { operation }),
      name: CommunityLog.nameOf(error),
    });
  }

  private warn(text: string, meta: Record<string, string>): void {
    this.logger.warn(LOG_SOURCE, text, { messenger: this.messenger, ...meta });
  }

  private error(text: string, meta: Record<string, string>): void {
    this.logger.error(LOG_SOURCE, text, { messenger: this.messenger, ...meta });
  }

  private static nameOf(error: unknown): string {
    return error instanceof Error ? error.name : typeof error;
  }
}
