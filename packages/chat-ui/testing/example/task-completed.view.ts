import { NotificationPresenter } from 'dmg-ui/chat-ui';
import { TaskCompletedNotificationDef } from 'dmg-ui/testing';

/** «Поручение выполнено» в диалоге: подпись уведомления и название. */
export const TaskCompletedView = NotificationPresenter.for(
  TaskCompletedNotificationDef,
  ({ title }) => `${TaskCompletedNotificationDef.label}: ${title}`,
);
