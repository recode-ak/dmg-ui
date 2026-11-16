import { UiAppDef } from 'dmg-ui';
import { ExampleUiSetDef } from '../example-ui.set';
import { AssignedTasksScreenDef } from '../todo/assigned-tasks.screen';
import { FinishTasksStoryDef } from '../todo/finish-tasks.story';
import { FollowAssignedStoryDef } from '../todo/follow-assigned.story';
import { PlanTasksStoryDef } from '../todo/plan-tasks.story';
import { TaskAssignedNotificationDef } from '../todo/task-assigned.notification';
import { TaskCompletedNotificationDef } from '../todo/task-completed.notification';
import { TaskListScreenDef } from '../todo/task-list.screen';

/** Канал приложения UI — учебный диалоговый канал. */
export const DIALOG_CHANNEL = 'dmg-ui-dialog';

/** Приложение UI учебного примера в диалоговом канале: все сторис и уведомления, два входа. */
export const ExampleDialogAppDef = UiAppDef.define({
  name: 'exampleDialog',
  label: 'Учебное приложение в диалоге',
  description: 'Приложение UI учебного примера для диалогового канала.',
  set: ExampleUiSetDef,
  channel: DIALOG_CHANNEL,
  stories: [PlanTasksStoryDef, FinishTasksStoryDef, FollowAssignedStoryDef],
  notifications: [TaskAssignedNotificationDef, TaskCompletedNotificationDef],
  entries: {
    start: {
      label: 'Мои задачи',
      description: 'Список своих задач с начала.',
      address: TaskListScreenDef.at({ page: 0 }),
    },
    assigned: {
      label: 'Назначенные мне',
      description: 'Задачи, которые поручили вызывающему.',
      address: AssignedTasksScreenDef.at({}),
    },
  },
});
