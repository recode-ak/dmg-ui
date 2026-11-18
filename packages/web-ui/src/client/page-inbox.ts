import type { UiIds, UiObserver } from 'dmg-ui';
import * as v from 'valibot';
import type { ViewSource } from '../view/view-source.types';
import type { NotificationMessage } from '../wire/page-messages.types';
import {
  INBOX_LIMIT,
  PAGE_DEFECTS,
  SEEN_LIMIT,
  SEEN_TTL_MS,
} from './page-client.const';
import type { PageInboxEntry, PageInboxSpec } from './page-client.types';
import { PageSeenKeys } from './page-seen-keys';
import type { PageTraces } from './page-traces';
import { ViewCell } from './view-cell';

/**
 * Входящие вкладки — источник вида: уведомления сервера с данными и ссылками,
 * до `INBOX_LIMIT` записей, старейшая вытесняется. Повтор по `notification` +
 * `eventId` отсеивается с пределом и сроком (D-UI-24, D-UI-75). Данные
 * проверяет схема Def уведомления, текст строит представление. Области не
 * трогает: ссылку открывает `PageClient.openLink` — в `side`.
 */
export class PageInbox {
  private readonly ids: UiIds;
  private readonly observer: UiObserver;
  private readonly traces: PageTraces;
  private readonly seen: PageSeenKeys;
  private readonly cell: ViewCell<readonly PageInboxEntry[]>;

  constructor(spec: PageInboxSpec) {
    this.ids = spec.ids;
    this.observer = spec.observer;
    this.traces = spec.traces;
    this.seen = new PageSeenKeys({
      limit: SEEN_LIMIT,
      ttl: SEEN_TTL_MS,
      clock: spec.clock,
    });
    this.cell = new ViewCell<readonly PageInboxEntry[]>([], spec.onFault);
  }

  get source(): ViewSource<readonly PageInboxEntry[]> {
    return this.cell;
  }

  /**
   * Уведомление с сервера — внешние данные: неизвестный `id` или данные не по
   * схеме — не показано, не бросает (ERR-01), запись `defect` с фиксированным
   * текстом. Ключ не по схеме не ставится: верное с тем же ключом покажется.
   * Во входящие идут данные как пришли, а не выход схемы.
   */
  receive(message: NotificationMessage): void {
    const key = JSON.stringify([message.notification, message.eventId]);
    if (this.seen.has(key)) return;
    const def = this.ids.findNotification(message.notification);
    if (def === undefined) {
      this.defect(message.notification, PAGE_DEFECTS.unknown);
      return;
    }
    if (!v.safeParse(def.data, message.data).success) {
      this.defect(message.notification, PAGE_DEFECTS.badData);
      return;
    }
    this.seen.add(key);
    const entry: PageInboxEntry = {
      notification: message.notification,
      data: message.data,
      links: message.links,
    };
    this.cell.set([...this.cell.get(), entry].slice(-INBOX_LIMIT));
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
}
