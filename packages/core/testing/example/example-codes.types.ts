import type { NotificationCode, ScreenCode } from 'dmg-ui';
import type { AssignedTasksScreenDef } from './todo/assigned-tasks.screen';
import type { TaskAssignedNotificationDef } from './todo/task-assigned.notification';
import type { TaskCardScreenDef } from './todo/task-card.screen';
import type { TaskCompletedNotificationDef } from './todo/task-completed.notification';
import type { TaskListScreenDef } from './todo/task-list.screen';
import type { UserCardScreenDef } from './users/user-card.screen';

/** Подмена кода экранов и уведомлений примера (тесты); без поля — код примера. */
export type ExampleCodeOverrides = {
  readonly list?: ScreenCode<typeof TaskListScreenDef>;
  readonly card?: ScreenCode<typeof TaskCardScreenDef>;
  readonly assigned?: ScreenCode<typeof AssignedTasksScreenDef>;
  readonly user?: ScreenCode<typeof UserCardScreenDef>;
  readonly assignedNote?: NotificationCode<typeof TaskAssignedNotificationDef>;
  readonly completedNote?: NotificationCode<
    typeof TaskCompletedNotificationDef
  >;
};
