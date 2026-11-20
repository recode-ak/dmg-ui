import { TaskCompletedNotificationDef } from 'dmg-ui/testing';
import { PageNotePresenter } from 'dmg-ui/web-ui';

/** «Поручение выполнено» на странице: подпись уведомления и название. */
export const TaskCompletedView = PageNotePresenter.for(
  TaskCompletedNotificationDef,
  ({ title }) => `${TaskCompletedNotificationDef.label}: ${title}`,
);
