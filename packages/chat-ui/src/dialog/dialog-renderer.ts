import type { InstanceView, NotificationPreview } from 'dmg-ui';
import { DialogReplies } from './dialog-replies';
import type { DialogViews } from './dialog-views';

/**
 * Рендер вида и уведомления в текст без живого диалога, канала и сервера —
 * те же `DialogReplies` над представлениями, варианты — подписями в
 * скобках. Реализует порт `ExampleRenderer` помощника рендера примеров.
 */
export class DialogRenderer {
  private readonly replies: DialogReplies;

  constructor(views: DialogViews) {
    this.replies = new DialogReplies(views);
  }

  screen(view: InstanceView): string {
    return this.replies.plain(
      this.replies.screen(view),
      this.replies.options(view).map((option) => option.label),
    );
  }

  notification(preview: NotificationPreview): string {
    return this.replies.notification(preview.notification, preview.data);
  }
}
