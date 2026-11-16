import type { InstanceView, NotificationPreview } from 'dmg-ui';
import type { DialogReplies } from './dialog-replies';

/**
 * Рендер вида и уведомления в текст без живого диалога — тот же
 * `DialogReplies`, варианты — подписями в скобках. Реализует порт
 * `ExampleRenderer` помощника рендера примеров.
 */
export class DialogRenderer {
  constructor(private readonly replies: DialogReplies) {}

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
