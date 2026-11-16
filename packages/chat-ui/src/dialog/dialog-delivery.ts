import type {
  DeliveredNotification,
  NotificationDelivery,
} from 'dmg-ui/server';
import type { Dialog } from './dialog';

/**
 * Доставка уведомлений диалоговым каналом: реплика во входящие получателя,
 * ссылки — варианты. Повтор того же уведомления по тому же событию
 * отсеивается по `cause.eventId` (D-UI-24: без предела — учебный канал).
 */
export class DialogDelivery implements NotificationDelivery {
  private readonly seen = new Set<string>();

  constructor(private readonly dialogs: (uuid: string) => Dialog) {}

  async deliver(notification: DeliveredNotification): Promise<void> {
    const key = [
      notification.notification,
      notification.recipient,
      notification.cause.eventId,
    ].join(' ');
    if (this.seen.has(key)) return;
    // Ключ — после доставки: бросок не должен отсеять повтор уведомления.
    await this.dialogs(notification.recipient).notify(notification);
    this.seen.add(key);
  }
}
