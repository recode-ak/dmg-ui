import { UiModuleDef } from 'dmg-ui';
import { AssignedTasksScreenDef } from './assigned-tasks.screen';
import { FinishTasksStoryDef } from './finish-tasks.story';
import { FollowAssignedStoryDef } from './follow-assigned.story';
import { MainMenuScreenDef } from './main-menu.screen';
import { PlanTasksStoryDef } from './plan-tasks.story';
import { StartWorkStoryDef } from './start-work.story';
import { TaskAssignedNotificationDef } from './task-assigned.notification';
import { TaskCardScreenDef } from './task-card.screen';
import { TaskCompletedNotificationDef } from './task-completed.notification';
import { TaskListScreenDef } from './task-list.screen';

/** UI-модуль задач: меню и три экрана, четыре сторис, два уведомления. */
export const TodoUiModuleDef = UiModuleDef.define({
  name: 'todo',
  label: 'Задачи',
  description: 'Экраны, сторис и уведомления модуля задач.',
  screens: [
    TaskListScreenDef,
    TaskCardScreenDef,
    AssignedTasksScreenDef,
    MainMenuScreenDef,
  ],
  stories: [
    PlanTasksStoryDef,
    FinishTasksStoryDef,
    FollowAssignedStoryDef,
    StartWorkStoryDef,
  ],
  notifications: [TaskAssignedNotificationDef, TaskCompletedNotificationDef],
});
