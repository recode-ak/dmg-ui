import { NotificationPresenter } from 'dmg-ui/chat-ui';
import {
  TaskAssignedNotificationDef,
  TaskCompletedNotificationDef,
} from 'dmg-ui/testing';

/** «Вам назначена задача» в диалоге: подпись уведомления и название. */
export const TaskAssignedView = NotificationPresenter.for(
  TaskAssignedNotificationDef,
  ({ title }) => `${TaskAssignedNotificationDef.label}: ${title}`,
);

/** «Поручение выполнено» в диалоге: подпись уведомления и название. */
export const TaskCompletedView = NotificationPresenter.for(
  TaskCompletedNotificationDef,
  ({ title }) => `${TaskCompletedNotificationDef.label}: ${title}`,
);
