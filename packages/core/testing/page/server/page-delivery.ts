import type {
  DeliveredNotification,
  NotificationDelivery,
} from 'dmg-ui/server';
import type { NotificationMessage } from '../wire/page-messages.types';
import type { PageRecipient } from './page-server.types';

/**
 * Доставка уведомлений страничным каналом: сообщение `notification` во все
 * открытые соединения получателя. Через провод не идут `trace` доставки и
 * `recipient` (получатель — само соединение); причина — только `eventId`
 * для отсева повтора на клиенте (Т-6).
 *
 * Допущение учебного канала: у получателя нет открытого соединения —
 * уведомление не доставлено и не копится; подключившийся позже его не
 * получит. Боевой канал решает это сам (очередь, push, письмо).
 */
export class PageDelivery implements NotificationDelivery {
  private readonly recipients = new Map<string, Set<PageRecipient>>();

  /** Открытое соединение личности `uuid`. */
  attach(uuid: string, recipient: PageRecipient): void {
    const known = this.recipients.get(uuid);
    if (known === undefined) this.recipients.set(uuid, new Set([recipient]));
    else known.add(recipient);
  }

  /** Соединение закрыто: уведомлений больше не получает. */
  detach(uuid: string, recipient: PageRecipient): void {
    const known = this.recipients.get(uuid);
    known?.delete(recipient);
    if (known?.size === 0) this.recipients.delete(uuid);
  }

  async deliver(notification: DeliveredNotification): Promise<void> {
    const recipients = this.recipients.get(notification.recipient);
    if (recipients === undefined) return;
    const message: NotificationMessage = {
      kind: 'notification',
      notification: notification.notification,
      data: notification.data,
      links: notification.links,
      eventId: notification.cause.eventId,
    };
    for (const recipient of [...recipients]) recipient.notify(message);
  }
}
