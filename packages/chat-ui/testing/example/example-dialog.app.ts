import { UiAppDef } from 'dmg-ui';
import { DIALOG_CHANNEL } from 'dmg-ui/chat-ui';
import {
  AssignedTasksScreenDef,
  ExampleUiSetDef,
  FinishTasksStoryDef,
  FollowAssignedStoryDef,
  PlanTasksStoryDef,
  TaskAssignedNotificationDef,
  TaskCompletedNotificationDef,
  TaskListScreenDef,
  ViewUserStoryDef,
} from 'dmg-ui/testing';

/** Приложение UI учебного примера в диалоговом канале: сторис задач и карточка пользователя, все уведомления, два входа. */
export const ExampleDialogAppDef = UiAppDef.define({
  name: 'exampleDialog',
  label: 'Учебное приложение в диалоге',
  description: 'Приложение UI учебного примера для диалогового канала.',
  set: ExampleUiSetDef,
  channel: DIALOG_CHANNEL,
  stories: [
    PlanTasksStoryDef,
    FinishTasksStoryDef,
    FollowAssignedStoryDef,
    ViewUserStoryDef,
  ],
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
