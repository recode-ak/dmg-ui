import { UiAppDef } from 'dmg-ui';
import { DIALOG_CHANNEL } from 'dmg-ui/chat-ui';
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
 * Приложение UI учебного примера в диалоговом канале: меню, сторис задач и
 * карточка пользователя, все уведомления, три входа — список «в начало»,
 * поручения и меню.
 */
export const ExampleDialogUiAppDef = UiAppDef.define({
  name: 'exampleDialog',
  label: 'Учебное приложение в диалоге',
  description: 'Приложение UI учебного примера для диалогового канала.',
  set: ExampleUiSetDef,
  channel: DIALOG_CHANNEL,
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
