import { UiAppDef } from 'dmg-ui';
import { DIALOG_CHANNEL } from 'dmg-ui/chat-ui';
import {
  ExampleUiSetDef,
  FinishTasksStoryDef,
  FollowAssignedStoryDef,
  PlanTasksStoryDef,
  StartWorkStoryDef,
  TaskAssignedNotificationDef,
  TaskCompletedNotificationDef,
} from '../../platform/ui';
import { ExampleDialogUiAppDef } from './example-dialog.ui-app';

/**
 * Урезанное приложение учебного примера в диалоге: входы и уведомления
 * основного, сторис — меню и сторис задач, без карточки пользователя. Переход «Назначенные мне» →
 * карточка исполнителя отрезан составом приложения: его не показывает ядро.
 */
export const ExampleTrimmedUiAppDef = UiAppDef.define({
  name: 'exampleTrimmed',
  label: 'Учебное приложение в диалоге без карточки пользователя',
  description:
    'Приложение UI учебного примера для диалогового канала без просмотра карточки пользователя.',
  set: ExampleUiSetDef,
  channel: DIALOG_CHANNEL,
  stories: [
    StartWorkStoryDef,
    PlanTasksStoryDef,
    FinishTasksStoryDef,
    FollowAssignedStoryDef,
  ],
  notifications: [TaskAssignedNotificationDef, TaskCompletedNotificationDef],
  entries: ExampleDialogUiAppDef.entries,
});
