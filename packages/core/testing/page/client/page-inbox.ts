import type { NotificationMessage } from '../wire/page-messages.types';
import type { PageInboxEntry } from './page-client.types';
import type { PageViews } from './page-views';

/**
 * Входящие вкладки: уведомления сервера текстом представления и ссылками.
 * Повтор того же уведомления по тому же событию (`notification` +
 * `eventId`) отсеивается (Т-6). Области вкладки не трогает: ссылку
 * открывает `PageClient.openLink` — в `side`.
 *
 * Допущение учебного канала: отсеянные ключи и входящие растут без предела.
 */
export class PageInbox {
  private readonly entries: PageInboxEntry[] = [];
  private readonly seen = new Set<string>();

  constructor(private readonly views: PageViews) {}

  get list(): readonly PageInboxEntry[] {
    return this.entries;
  }

  /**
   * Уведомление с сервера — внешние данные: неизвестный `id` или данные не
   * по схеме представления не показываются и не бросают (ERR-01).
   */
  receive(message: NotificationMessage): void {
    const key = JSON.stringify([message.notification, message.eventId]);
    if (this.seen.has(key)) return;
    let text: string;
    try {
      text = this.views.notification(message.notification).text(message.data);
    } catch {
      return;
    }
    this.seen.add(key);
    this.entries.push({ text, links: message.links });
  }

  /** Текст входящих для страницы; пусто — `undefined`. */
  text(title: string): string | undefined {
    if (this.entries.length === 0) return undefined;
    return [title, ...this.entries.map((entry) => `- ${entry.text}`)].join(
      '\n',
    );
  }
}
