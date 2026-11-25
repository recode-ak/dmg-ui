import { UiModuleDef } from 'dmg-ui';
import { FinishTasksStoryDef } from './finish-tasks/finish-tasks.story';
import { TaskCardScreenDef } from './finish-tasks/task-card.screen';
import { AssignedTasksScreenDef } from './follow-assigned/assigned-tasks.screen';
import { FollowAssignedStoryDef } from './follow-assigned/follow-assigned.story';
import { PlanTasksStoryDef } from './plan-tasks/plan-tasks.story';
import { TaskAssignedNotificationDef } from './shared/task-assigned.notification';
import { TaskCompletedNotificationDef } from './shared/task-completed.notification';
import { TaskListScreenDef } from './shared/task-list.screen';
import { MainMenuScreenDef } from './start-work/main-menu.screen';
import { StartWorkStoryDef } from './start-work/start-work.story';

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
