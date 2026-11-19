import type { ExampleUser } from 'dmg-core/testing/example';
import type { NotificationCode, ScreenCode } from 'dmg-ui';
import type { AssignedTasksScreenDef } from './todo/assigned-tasks.screen';
import type { MainMenuScreenDef } from './todo/main-menu.screen';
import type { TaskAssignedNotificationDef } from './todo/task-assigned.notification';
import type { TaskCardScreenDef } from './todo/task-card.screen';
import type { TaskCompletedNotificationDef } from './todo/task-completed.notification';
import type { TaskListScreenDef } from './todo/task-list.screen';
import type { UserCardScreenDef } from './users/user-card.screen';

/**
 * Подмена кода экранов и уведомлений примера (тесты); без поля — код
 * примера. Субъект кода — пользователь учебного приложения (`ExampleUser`).
 */
export type ExampleCodeOverrides = {
  readonly list?: ScreenCode<typeof TaskListScreenDef, ExampleUser>;
  readonly card?: ScreenCode<typeof TaskCardScreenDef, ExampleUser>;
  readonly assigned?: ScreenCode<typeof AssignedTasksScreenDef, ExampleUser>;
  readonly menu?: ScreenCode<typeof MainMenuScreenDef, ExampleUser>;
  readonly user?: ScreenCode<typeof UserCardScreenDef, ExampleUser>;
  readonly assignedNote?: NotificationCode<typeof TaskAssignedNotificationDef>;
  readonly completedNote?: NotificationCode<
    typeof TaskCompletedNotificationDef
  >;
};
