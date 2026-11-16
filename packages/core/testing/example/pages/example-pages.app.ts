import { UiAppDef } from 'dmg-ui';
import { PAGE_CHANNEL } from '../../page/page-channel.const';
import { ExampleUiSetDef } from '../example-ui.set';
import { AssignedTasksScreenDef } from '../todo/assigned-tasks.screen';
import { FinishTasksStoryDef } from '../todo/finish-tasks.story';
import { FollowAssignedStoryDef } from '../todo/follow-assigned.story';
import { PlanTasksStoryDef } from '../todo/plan-tasks.story';
import { TaskAssignedNotificationDef } from '../todo/task-assigned.notification';
import { TaskCompletedNotificationDef } from '../todo/task-completed.notification';
import { TaskListScreenDef } from '../todo/task-list.screen';

/** Приложение UI учебного примера на страницах: те же сторис и уведомления, что в диалоге; два входа. */
export const ExamplePagesAppDef = UiAppDef.define({
  name: 'examplePages',
  label: 'Учебное приложение на страницах',
  description: 'Приложение UI учебного примера для страничного канала.',
  set: ExampleUiSetDef,
  channel: PAGE_CHANNEL,
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
