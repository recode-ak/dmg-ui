import type { InstanceView, NotificationPreview } from 'dmg-ui';
import { PlainText } from '../message/plain-text';
import type { MessengerCapabilities } from '../messenger/messenger.types';
import type { ChatViews } from '../view/chat-views';
import { ScreenComposer } from '../view/screen-composer';
import type { ViewMessage } from '../view/view.types';
import { REPLY_CAPABILITIES } from './reply-messenger';

/**
 * Рендер вида и уведомления в текст без живого диалога, канала и сервера —
 * тот же сборщик показа над представлениями: сообщение — текст и подписи
 * вариантов в скобках, сообщения — через пустую строку. Реализует порт
 * `ExampleRenderer` помощника рендера примеров.
 */
export class DialogRenderer {
  private readonly composer: ScreenComposer;

  /** Возможности по умолчанию — просторные: тексты примеров не режутся. */
  constructor(
    private readonly views: ChatViews,
    capabilities: MessengerCapabilities = REPLY_CAPABILITIES,
  ) {
    this.composer = new ScreenComposer(views, capabilities);
  }

  screen(view: InstanceView): string {
    return this.composer
      .compose(view, false)
      .messages.map((message) => DialogRenderer.plain(message))
      .join('\n\n');
  }

  notification(preview: NotificationPreview): string {
    return this.views.notification(preview.notification).text(preview.data);
  }

  /** Текст и подписи вариантов одной строкой; пустые части опускаются. */
  private static plain(message: ViewMessage): string {
    const labels = message.options.map((option) => `[${option.label}]`);
    return [PlainText.of(message.text), labels.join(' ')]
      .filter((part) => part !== '')
      .join('\n\n');
  }
}
