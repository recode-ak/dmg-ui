import type { CommunitySignal, CommunitySignalKind } from 'dmg-ui/chat-ui';
import type {
  ChatMemberUpdated,
  JoinRequest,
  MemberStatus,
  RefusedUpdateKind,
  SignalOutcome,
} from './telegram-updates.types';

const IGNORED: SignalOutcome = { kind: 'ignored' };

/**
 * Перевод апдейтов группы в сигнал сообщества (D-UI-65) — чистый. Группа —
 * `group`/`supergroup` с `chat.id` < 0, иначе отказ `chat`; бот в личном чате
 * или канале (`my_chat_member`, `chat_member` канала) — «ничего». Эхо:
 * `chat_member` от самого бота — «ничего». Поля сигнала — строки.
 */
export class TelegramCommunitySignals {
  constructor(private readonly bot: number) {}

  /** Смена статуса участника: вошёл — `joined`, вышел — `left`, прочее — «ничего». */
  member(id: number, update: ChatMemberUpdated): SignalOutcome {
    const skipped = TelegramCommunitySignals.place('chat_member', update.chat);
    if (skipped !== undefined) return skipped;
    if (update.from.id === this.bot) return IGNORED;
    const kind = TelegramCommunitySignals.change(update, 'joined', 'left');
    return kind === undefined
      ? IGNORED
      : TelegramCommunitySignals.signal(
          id,
          kind,
          update.chat.id,
          update.new_chat_member.user.id,
        );
  }

  /** Смена статуса бота: добавили — `added`, убрали — `removed`; `member` — кто это сделал. */
  bots(id: number, update: ChatMemberUpdated): SignalOutcome {
    const skipped = TelegramCommunitySignals.place(
      'my_chat_member',
      update.chat,
    );
    if (skipped !== undefined) return skipped;
    const kind = TelegramCommunitySignals.change(update, 'added', 'removed');
    return kind === undefined
      ? IGNORED
      : TelegramCommunitySignals.signal(
          id,
          kind,
          update.chat.id,
          update.from.id,
        );
  }

  /** Заявка на вступление в группу — `requested`, `member` — подавший заявку. */
  request(id: number, request: JoinRequest): SignalOutcome {
    if (!TelegramCommunitySignals.group(request.chat)) {
      return TelegramCommunitySignals.refused('chat_join_request');
    }
    return TelegramCommunitySignals.signal(
      id,
      'requested',
      request.chat.id,
      request.from.id,
    );
  }

  /** `undefined` — чат группа; иначе итог: бот в личном чате или канале — «ничего», прочее — отказ `chat`. */
  private static place(
    update: RefusedUpdateKind,
    chat: { id: number; type: string },
  ): SignalOutcome | undefined {
    if (TelegramCommunitySignals.group(chat)) return undefined;
    if (chat.type === 'channel') return IGNORED;
    if (chat.type === 'private' && update === 'my_chat_member') return IGNORED;
    return TelegramCommunitySignals.refused(update);
  }

  private static group(chat: { id: number; type: string }): boolean {
    return (chat.type === 'group' || chat.type === 'supergroup') && chat.id < 0;
  }

  /** Был вне и стал в группе — `entered`, наоборот — `exited`, иначе `undefined`. */
  private static change(
    update: ChatMemberUpdated,
    entered: CommunitySignalKind,
    exited: CommunitySignalKind,
  ): CommunitySignalKind | undefined {
    const was = TelegramCommunitySignals.present(update.old_chat_member);
    const now = TelegramCommunitySignals.present(update.new_chat_member);
    if (!was && now) return entered;
    if (was && !now) return exited;
    return undefined;
  }

  /** В группе ли: `restricted` — по `is_member`, схема его требует. */
  private static present(member: MemberStatus): boolean {
    switch (member.status) {
      case 'creator':
      case 'administrator':
      case 'member':
        return true;
      case 'restricted':
        return member.is_member === true;
      case 'left':
      case 'kicked':
        return false;
      default:
        member.status satisfies never;
        return false;
    }
  }

  private static signal(
    id: number,
    kind: CommunitySignalKind,
    community: number,
    member: number,
  ): SignalOutcome {
    const signal: CommunitySignal = {
      id: String(id),
      kind,
      community: String(community),
      member: String(member),
    };
    return { kind: 'community', signal };
  }

  private static refused(update: RefusedUpdateKind): SignalOutcome {
    return { kind: 'refused', reason: 'chat', update };
  }
}
