import { UiModuleDef } from 'dmg-ui';
import { AssignedTasksScreenDef } from './assigned-tasks.screen';
import { FinishTasksStoryDef } from './finish-tasks.story';
import { FollowAssignedStoryDef } from './follow-assigned.story';
import { PlanTasksStoryDef } from './plan-tasks.story';
import { TaskAssignedNotificationDef } from './task-assigned.notification';
import { TaskCardScreenDef } from './task-card.screen';
import { TaskCompletedNotificationDef } from './task-completed.notification';
import { TaskListScreenDef } from './task-list.screen';

/** UI-модуль задач: три экрана, три сторис, два уведомления. */
export const TodoUiModuleDef = UiModuleDef.define({
  name: 'todo',
  label: 'Задачи',
  description: 'Экраны, сторис и уведомления модуля задач.',
  screens: [TaskListScreenDef, TaskCardScreenDef, AssignedTasksScreenDef],
  stories: [PlanTasksStoryDef, FinishTasksStoryDef, FollowAssignedStoryDef],
  notifications: [TaskAssignedNotificationDef, TaskCompletedNotificationDef],
});
