import { PageNotePresenter } from '../../page/client/page-views';
import { TaskAssignedNotificationDef } from '../todo/task-assigned.notification';
import { TaskCompletedNotificationDef } from '../todo/task-completed.notification';

/** «Вам назначена задача» на странице: подпись уведомления и название. */
export const TaskAssignedView = PageNotePresenter.for(
  TaskAssignedNotificationDef,
  ({ title }) => `${TaskAssignedNotificationDef.label}: ${title}`,
);

/** «Поручение выполнено» на странице: подпись уведомления и название. */
export const TaskCompletedView = PageNotePresenter.for(
  TaskCompletedNotificationDef,
  ({ title }) => `${TaskCompletedNotificationDef.label}: ${title}`,
);
