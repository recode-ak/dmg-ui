import { NotificationPresenter } from '../../dialog';
import { TaskAssignedNotificationDef } from '../todo/task-assigned.notification';
import { TaskCompletedNotificationDef } from '../todo/task-completed.notification';

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
