import type { ExampleUser } from 'dmg-core/testing/example';
import type { NotificationCode, ScreenCode } from 'dmg-ui';
import type {
  AssignedTasksScreenDef,
  MainMenuScreenDef,
  TaskAssignedNotificationDef,
  TaskCardScreenDef,
  TaskCompletedNotificationDef,
  TaskListScreenDef,
} from '../../../platform/ui';

/**
 * Подмена кода экранов и уведомлений модуля `todo` (тесты); без поля — код
 * примера. Субъект кода — пользователь учебного приложения (`ExampleUser`).
 */
export type TodoCodeOverrides = {
  readonly list?: ScreenCode<typeof TaskListScreenDef, ExampleUser>;
  readonly card?: ScreenCode<typeof TaskCardScreenDef, ExampleUser>;
  readonly assigned?: ScreenCode<typeof AssignedTasksScreenDef, ExampleUser>;
  readonly menu?: ScreenCode<typeof MainMenuScreenDef, ExampleUser>;
  readonly assignedNote?: NotificationCode<typeof TaskAssignedNotificationDef>;
  readonly completedNote?: NotificationCode<
    typeof TaskCompletedNotificationDef
  >;
};
