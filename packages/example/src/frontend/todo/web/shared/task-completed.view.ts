import { PageNotePresenter } from 'dmg-ui/web-ui';
import { TaskCompletedNotificationDef } from '../../../../platform/ui';

/** «Поручение выполнено»: подпись уведомления и название. */
export const TaskCompletedView = PageNotePresenter.for(
  TaskCompletedNotificationDef,
  ({ title }) => `${TaskCompletedNotificationDef.label}: ${title}`,
);
