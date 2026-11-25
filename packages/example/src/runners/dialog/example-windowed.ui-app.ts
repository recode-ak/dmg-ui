import { UiAppDef } from 'dmg-ui';
import { DIALOG_CHANNEL } from 'dmg-ui/chat-ui';
import {
  ExampleUiSetDef,
  FinishTasksStoryDef,
  FollowAssignedStoryDef,
  PlanTasksStoryDef,
  TaskAssignedNotificationDef,
  TaskCompletedNotificationDef,
  TaskListScreenDef,
} from '../../platform/ui';

/** Второе приложение учебного примера — мессенджер «не правит, три варианта, окно инициативы»: все сторис и уведомления, один вход. */
export const ExampleWindowedUiAppDef = UiAppDef.define({
  name: 'exampleWindowed',
  label: 'Учебное приложение в мессенджере с окном',
  description:
    'Приложение UI учебного примера для мессенджера без правки, с тремя вариантами и окном инициативы.',
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
  },
});
