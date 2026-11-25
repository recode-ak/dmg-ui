import { UiAppDef } from 'dmg-ui';
import { PAGE_CHANNEL } from 'dmg-ui/web-ui';
import {
  AssignedTasksScreenDef,
  ExampleUiSetDef,
  FinishTasksStoryDef,
  FollowAssignedStoryDef,
  MainMenuScreenDef,
  PlanTasksStoryDef,
  StartWorkStoryDef,
  TaskAssignedNotificationDef,
  TaskCompletedNotificationDef,
  TaskListScreenDef,
  ViewUserStoryDef,
} from '../../platform/ui';

/**
 * Приложение UI учебного примера на страницах: сторис и уведомления диалога
 * без профиля — сторис профиля отрезана, меню его действие не показывает;
 * три входа, меню — `menu`.
 */
export const ExamplePagesUiAppDef = UiAppDef.define({
  name: 'examplePages',
  label: 'Учебное приложение на страницах',
  description: 'Приложение UI учебного примера для страничного канала.',
  set: ExampleUiSetDef,
  channel: PAGE_CHANNEL,
  stories: [
    StartWorkStoryDef,
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
    menu: {
      label: 'Начать работу',
      description: 'Меню: свои задачи и поручения.',
      address: MainMenuScreenDef.at({}),
    },
  },
});
