import { UiAppDef } from 'dmg-ui';
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
import { PAGE_CHANNEL } from 'dmg-ui/web-ui';

/** Приложение UI учебного примера на страницах: те же сторис и уведомления, что в основном приложении диалога; два входа. */
export const ExamplePagesAppDef = UiAppDef.define({
  name: 'examplePages',
  label: 'Учебное приложение на страницах',
  description: 'Приложение UI учебного примера для страничного канала.',
  set: ExampleUiSetDef,
  channel: PAGE_CHANNEL,
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
