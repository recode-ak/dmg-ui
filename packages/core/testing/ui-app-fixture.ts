import { UiAppDef } from 'dmg-ui';
import { ExampleUiSetDef } from './example/example-ui.set';
import { AssignedTasksScreenDef } from './example/todo/assigned-tasks.screen';
import { FinishTasksStoryDef } from './example/todo/finish-tasks.story';
import { FollowAssignedStoryDef } from './example/todo/follow-assigned.story';
import { PlanTasksStoryDef } from './example/todo/plan-tasks.story';
import { TaskAssignedNotificationDef } from './example/todo/task-assigned.notification';
import { TaskCompletedNotificationDef } from './example/todo/task-completed.notification';
import { TaskListScreenDef } from './example/todo/task-list.screen';

/** Приложение UI учебного примера в подставном канале: все сторис и уведомления, два входа. Внутренний помощник тестов ядра. */
export const ExampleStubAppDef = UiAppDef.define({
  name: 'exampleStub',
  label: 'Учебное приложение в подставном канале',
  description: 'Приложение UI учебного примера для тестов ядра.',
  set: ExampleUiSetDef,
  channel: 'dmg-ui-stub',
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
