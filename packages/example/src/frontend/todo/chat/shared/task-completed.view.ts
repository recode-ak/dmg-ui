import { NotificationPresenter } from 'dmg-ui/chat-ui';
import { TaskCompletedNotificationDef } from '../../../../platform/ui';

/** «Поручение выполнено» в диалоге: подпись уведомления и название. */
export const TaskCompletedView = NotificationPresenter.for(
  TaskCompletedNotificationDef,
  ({ title }) => `${TaskCompletedNotificationDef.label}: ${title}`,
);
