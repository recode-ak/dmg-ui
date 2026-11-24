import type { DeliveredNotification } from 'dmg-ui/server';
import type { Message } from '../message/message.types';
import type { MessengerPort } from '../messenger/messenger.types';
import type { AppChatViews } from '../view/app-chat-views';
import { MAX_NOTIFIED } from './conversation.const';
import type { ConversationLog } from './conversation-log';
import type { ConversationOutput } from './conversation-output';
import type { ConversationReplies } from './conversation-replies';
import type { RefTable } from './ref-table';
import { SeenIds } from './seen-ids';
import { Sha256 } from './sha256';

/** Части беседы, через которые идёт уведомление. */
type NoticesParts = {
  readonly messenger: MessengerPort;
  readonly peer: string;
  readonly views: AppChatViews;
  readonly refs: RefTable;
  readonly replies: ConversationReplies;
  readonly log: ConversationLog;
  readonly output: ConversationOutput;
};

/**
 * Входящее уведомление беседы (D-UI-56): отсев повтора по событию-причине
 * (память — в снимке), сборка сообщения, доставка порту `notify`. Живой
 * экран, черновик и путь не трогает; дошедшее сбивает положение места,
 * недошедшее — ни отсева, ни ссылок в таблице.
 *
 * @see conversation-notices.test.ts
 */
export class ConversationNotices {
  private readonly seen: SeenIds;

  /** `notified` — отсев из снимка. */
  constructor(
    private readonly parts: NoticesParts,
    notified?: readonly string[],
  ) {
    this.seen = new SeenIds(notified, MAX_NOTIFIED);
  }

  /** `repeat` — уже доставлено по этому событию; `undelivered` — порт отказал. Бросок представления — наружу. */
  async deliver(
    n: DeliveredNotification,
  ): Promise<'delivered' | 'repeat' | 'undelivered'> {
    const { messenger, peer, views, refs, replies, log, output } = this.parts;
    // Получатель — сама беседа: в ключ не входит; в снимок идёт хэш, не id события.
    const key = await Sha256.hex(
      JSON.stringify([n.notification, n.cause.eventId]),
    );
    if (this.seen.has(key)) return 'repeat';
    const text = views.notification(n.notification).text(n.data);
    const message: Message = replies.notice(text, n.links);
    const links = message.options.map((option) => option.ref);
    let delivery: Awaited<ReturnType<typeof messenger.notify>>;
    try {
      delivery = await messenger.notify(peer, message);
    } catch (error) {
      // Бросок порта: ссылок в таблице не остаётся, бросок идёт к узлу.
      refs.drop(links);
      throw error;
    }
    if (!delivery.ok) {
      refs.drop(links);
      log.undelivered('notify', delivery.error.reason);
      return 'undelivered';
    }
    // Ключ — после доставки: повтор после недоставки доходит.
    this.seen.accept(key);
    output.knock();
    return 'delivered';
  }

  /** Для снимка: ключи отсева, старые первыми. */
  toJSON(): readonly string[] {
    return this.seen.toJSON();
  }
}
