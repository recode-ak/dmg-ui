import type { PageInboxEntry } from 'dmg-ui/web-ui';
import { NOTE_UNSHOWN } from '../../../frontend/web-kit/view-texts.const';
import type { AppExampleViews } from './app-example-views';
import type { InboxItem } from './inbox-model.types';

type NoteViews = Pick<AppExampleViews, 'findNotification'>;

const textOf = (entry: PageInboxEntry, views: NoteViews): string => {
  try {
    return (
      views.findNotification(entry.notification)?.text(entry.data) ??
      NOTE_UNSHOWN
    );
  } catch {
    return NOTE_UNSHOWN;
  }
};

/**
 * Модель входящих: текст каждой записи строит представление уведомления.
 * Неизвестный id и данные не по схеме — «Уведомление не показано»; бросок
 * наружу не уходит. Каждый вызов — новый список. Объект, а не класс:
 * преобразование без состояния (biome `noStaticOnlyClass`).
 */
export const InboxModel = {
  of(entries: readonly PageInboxEntry[], views: NoteViews): InboxItem[] {
    return entries.map((entry) => ({
      text: textOf(entry, views),
      links: entry.links,
    }));
  },
} as const;
