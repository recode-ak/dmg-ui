import {
  TaskAssignedNotificationDef,
  TaskCompletedNotificationDef,
} from 'dmg-ui/testing';
import { PageNotePresenter } from 'dmg-ui/web-ui';

/** «Вам назначена задача»: подпись уведомления и название. */
export const TaskAssignedView = PageNotePresenter.for(
  TaskAssignedNotificationDef,
  ({ title }) => `${TaskAssignedNotificationDef.label}: ${title}`,
);

/** «Поручение выполнено»: подпись уведомления и название. */
export const TaskCompletedView = PageNotePresenter.for(
  TaskCompletedNotificationDef,
  ({ title }) => `${TaskCompletedNotificationDef.label}: ${title}`,
);
