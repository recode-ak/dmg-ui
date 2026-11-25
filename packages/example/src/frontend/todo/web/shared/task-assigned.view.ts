import { PageNotePresenter } from 'dmg-ui/web-ui';
import { TaskAssignedNotificationDef } from '../../../../platform/ui';

/** «Вам назначена задача»: подпись уведомления и название. */
export const TaskAssignedView = PageNotePresenter.for(
  TaskAssignedNotificationDef,
  ({ title }) => `${TaskAssignedNotificationDef.label}: ${title}`,
);
