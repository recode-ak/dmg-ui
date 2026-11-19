import { UiAppDef } from 'dmg-ui';
import { DIALOG_CHANNEL } from 'dmg-ui/chat-ui';
import {
  ExampleUiSetDef,
  FinishTasksStoryDef,
  FollowAssignedStoryDef,
  PlanTasksStoryDef,
  TaskAssignedNotificationDef,
  TaskCompletedNotificationDef,
} from 'dmg-ui/testing';
import { ExampleDialogAppDef } from './example-dialog.app';

/**
 * Урезанное приложение учебного примера в диалоге: входы и уведомления
 * основного, сторис — без карточки пользователя. Переход «Назначенные мне» →
 * карточка исполнителя отрезан составом приложения: его не показывает ядро.
 */
export const ExampleTrimmedDialogAppDef = UiAppDef.define({
  name: 'exampleTrimmed',
  label: 'Учебное приложение в диалоге без карточки пользователя',
  description:
    'Приложение UI учебного примера для диалогового канала без просмотра карточки пользователя.',
  set: ExampleUiSetDef,
  channel: DIALOG_CHANNEL,
  stories: [PlanTasksStoryDef, FinishTasksStoryDef, FollowAssignedStoryDef],
  notifications: [TaskAssignedNotificationDef, TaskCompletedNotificationDef],
  entries: ExampleDialogAppDef.entries,
});
