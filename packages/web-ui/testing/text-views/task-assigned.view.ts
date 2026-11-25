import { TaskAssignedNotificationDef } from 'dmg-ui/example';
import { PageNotePresenter } from 'dmg-ui/web-ui';

/** «Вам назначена задача» на странице: подпись уведомления и название. */
export const TaskAssignedView = PageNotePresenter.for(
  TaskAssignedNotificationDef,
  ({ title }) => `${TaskAssignedNotificationDef.label}: ${title}`,
);
