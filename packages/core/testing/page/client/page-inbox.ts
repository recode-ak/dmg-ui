import type { UiObserver } from 'dmg-ui';
import type { NotificationMessage } from '../wire/page-messages.types';
import { PAGE_DEFECTS } from './page-client.const';
import type { PageInboxEntry } from './page-client.types';
import type { PageTraces } from './page-traces';
import type { PageViews } from './page-views';

/**
 * Входящие вкладки: уведомления сервера текстом представления и ссылками;
 * повтор по `notification` + `eventId` отсеивается (Т-6). Области не
 * трогает: ссылку открывает `PageClient.openLink` — в `side`. Допущение:
 * отсеянные ключи и входящие растут без предела.
 */
export class PageInbox {
  private readonly entries: PageInboxEntry[] = [];
  private readonly seen = new Set<string>();

  constructor(
    private readonly views: PageViews,
    private readonly observer: UiObserver,
    private readonly traces: PageTraces,
  ) {}

  get list(): readonly PageInboxEntry[] {
    return this.entries;
  }

  /**
   * Уведомление с сервера — внешние данные: неизвестный `id` или бросок
   * представления (данные не по схеме) — не показано, не бросает (ERR-01),
   * запись `defect` наблюдателю с фиксированным текстом.
   */
  receive(message: NotificationMessage): void {
    const key = JSON.stringify([message.notification, message.eventId]);
    if (this.seen.has(key)) return;
    const presenter = this.views.findNotification(message.notification);
    if (presenter === undefined) {
      this.defect(message.notification, PAGE_DEFECTS.noView);
      return;
    }
    let text: string;
    try {
      text = presenter.text(message.data);
    } catch {
      this.defect(message.notification, PAGE_DEFECTS.badData);
      return;
    }
    this.seen.add(key);
    this.entries.push({ text, links: message.links });
  }

  /** След — свой на входящий сигнал вкладки, как у прочих сигналов. */
  private defect(node: string, text: string): void {
    this.observer.record({
      kind: 'defect',
      node,
      trace: this.traces.next(),
      text,
    });
  }

  /** Текст входящих для страницы; пусто — `undefined`. */
  text(title: string): string | undefined {
    if (this.entries.length === 0) return undefined;
    return [title, ...this.entries.map((entry) => `- ${entry.text}`)].join(
      '\n',
    );
  }
}
