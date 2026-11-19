import { UiAppDef } from 'dmg-ui';
import { ExampleUiSetDef } from './example/example-ui.set';
import { AssignedTasksScreenDef } from './example/todo/assigned-tasks.screen';
import { FinishTasksStoryDef } from './example/todo/finish-tasks.story';
import { FollowAssignedStoryDef } from './example/todo/follow-assigned.story';
import { MainMenuScreenDef } from './example/todo/main-menu.screen';
import { PlanTasksStoryDef } from './example/todo/plan-tasks.story';
import { StartWorkStoryDef } from './example/todo/start-work.story';
import { TaskAssignedNotificationDef } from './example/todo/task-assigned.notification';
import { TaskCompletedNotificationDef } from './example/todo/task-completed.notification';
import { TaskListScreenDef } from './example/todo/task-list.screen';
import { ViewUserStoryDef } from './example/users/view-user.story';

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

const MENU_ENTRIES = {
  ...ExampleStubAppDef.entries,
  menu: {
    label: 'Начать работу',
    description: 'Меню: свои задачи и поручения.',
    address: MainMenuScreenDef.at({}),
  },
};

/**
 * Приложение UI учебного примера с меню в подставном канале: корень
 * `startWork`, три сторис задач и карточка пользователя. Внутренний помощник
 * тестов дерева сторис.
 */
export const ExampleMenuStubAppDef = UiAppDef.define({
  name: 'exampleMenuStub',
  label: 'Учебное приложение с меню в подставном канале',
  description: 'Приложение UI учебного примера с меню для тестов ядра.',
  set: ExampleUiSetDef,
  channel: 'dmg-ui-stub',
  stories: [
    StartWorkStoryDef,
    PlanTasksStoryDef,
    FinishTasksStoryDef,
    FollowAssignedStoryDef,
    ViewUserStoryDef,
  ],
  notifications: [TaskAssignedNotificationDef, TaskCompletedNotificationDef],
  entries: MENU_ENTRIES,
});

/** То же приложение с меню без карточки пользователя: её отрезает состав. */
export const ExampleMenuTrimmedStubAppDef = UiAppDef.define({
  name: 'exampleMenuTrimmedStub',
  label: 'Учебное приложение с меню без карточки пользователя',
  description:
    'Приложение UI учебного примера с меню без просмотра карточки пользователя.',
  set: ExampleUiSetDef,
  channel: 'dmg-ui-stub',
  stories: [
    StartWorkStoryDef,
    PlanTasksStoryDef,
    FinishTasksStoryDef,
    FollowAssignedStoryDef,
  ],
  notifications: [TaskAssignedNotificationDef, TaskCompletedNotificationDef],
  entries: MENU_ENTRIES,
});
