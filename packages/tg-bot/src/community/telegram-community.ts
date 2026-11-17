import { err, ok } from 'dmg-core';
import type { CommunityPort, Delivery } from 'dmg-ui/chat-ui';
import type { BotApi } from '../bot-api/bot-api.types';
import type { BotApiCaller } from '../bot-api/bot-api-caller';
import type { BotApiOutcome } from '../bot-api/bot-api-caller.types';
import { telegramInteger } from '../messenger/telegram-integer';
import type { TelegramLog } from '../telegram-log';
import type { TelegramOperation } from '../telegram-log.types';
import {
  EXCLUDE_BAN_SECONDS,
  MIN_UNIX_SECONDS,
} from './telegram-community.const';
import type {
  CommunityTarget,
  TelegramCommunitySpec,
} from './telegram-community.types';

const REJECTED = err({ reason: 'rejected' as const });
const UNAVAILABLE = err({ reason: 'unavailable' as const });

/**
 * Операции группы Telegram поверх порта Bot API (D-UI-65). `exclude` — бан на
 * 5 минут (`until_date` — страховка от вечного бана, срок проверен: неверные
 * часы — отказ без вызова) и `unban` с `only_if_banned`; `approve` — принятие заявки; `invite` не объявлена —
 * отказ без вызова. Handle группы — каноническое целое < 0, участник — > 0,
 * иначе отказ без вызова. Не бросает (ERR-01); лог без id (ERR-07).
 */
export class TelegramCommunity implements CommunityPort {
  private readonly api: BotApi;
  private readonly caller: BotApiCaller;
  private readonly log: TelegramLog;
  private readonly now: () => number;

  constructor(spec: TelegramCommunitySpec) {
    this.api = spec.api;
    this.caller = spec.caller;
    this.log = spec.log;
    this.now = spec.now;
  }

  async exclude(community: string, member: string): Promise<Delivery<void>> {
    const target = this.target('exclude', community, member);
    if (target === undefined) return REJECTED;
    const until = Math.floor(this.now() / 1000) + EXCLUDE_BAN_SECONDS;
    if (!Number.isSafeInteger(until) || until <= MIN_UNIX_SECONDS) {
      this.log.badClock('exclude');
      return REJECTED;
    }
    const ban = await this.caller.call(
      'banChatMember',
      () => this.api.banChatMember({ ...target, until_date: until }),
      'exclude',
    );
    const banned = this.settled(ban);
    if (!banned.ok) return banned;
    const unban = await this.caller.call(
      'unbanChatMember',
      () => this.api.unbanChatMember({ ...target, only_if_banned: true }),
      'exclude',
    );
    return this.settled(unban);
  }

  async approve(community: string, member: string): Promise<Delivery<void>> {
    const target = this.target('approve', community, member);
    if (target === undefined) return REJECTED;
    const outcome = await this.caller.call(
      'approveChatJoinRequest',
      () => this.api.approveChatJoinRequest(target),
      'approve',
    );
    return this.settled(outcome);
  }

  // biome-ignore lint/correctness/noUnusedFunctionParameters: порт требует метод, Telegram `invite` не объявляет — адрес не читается
  async invite(community: string, member: string): Promise<Delivery<void>> {
    this.log.notDeclared('invite');
    return REJECTED;
  }

  /** Адрес операции или `undefined` с записью `error`: handle не по формату — без вызова API. */
  private target(
    operation: TelegramOperation,
    community: string,
    member: string,
  ): CommunityTarget | undefined {
    const chat = telegramInteger(community, 'negative');
    if (chat === undefined) {
      this.log.badTarget(operation, 'community');
      return undefined;
    }
    const user = telegramInteger(member, 'positive');
    if (user === undefined) {
      this.log.badTarget(operation, 'member');
      return undefined;
    }
    return { chat_id: chat, user_id: user };
  }

  /** Итог вызова: отказ с новым id группы — `rejected` (запись «перенесена» пишет `BotApiCaller`, DEBT-UI-27). */
  private settled(outcome: BotApiOutcome): Delivery<void> {
    switch (outcome.kind) {
      case 'done':
        return ok();
      case 'refused': {
        if (outcome.failure.migrated()) return REJECTED;
        return err({ reason: outcome.failure.reason() });
      }
      case 'failed':
        return UNAVAILABLE;
      default:
        outcome satisfies never;
        return UNAVAILABLE;
    }
  }
}
