// Описание учебного проекта: набор UI поверх учебного приложения `dmg-core`;
// его отдаёт вход пакета для учебного проекта (`packages/example/index.ts`).

export { exampleSubject } from './example-subject';
export { ExampleUiSetDef } from './example-ui.set';
export { FinishTasksStoryDef } from './todo/finish-tasks/finish-tasks.story';
export { TaskCardScreenDef } from './todo/finish-tasks/task-card.screen';
export { AssignedTasksScreenDef } from './todo/follow-assigned/assigned-tasks.screen';
export { FollowAssignedStoryDef } from './todo/follow-assigned/follow-assigned.story';
export { PlanTasksStoryDef } from './todo/plan-tasks/plan-tasks.story';
export {
  ASSIGNED_ID,
  CARD_ID,
  LIST_ID,
  LIST_START,
  OWNER,
  TASK_A,
  TASK_B,
  TASK_PAGE_SIZE,
  type TaskRow,
  taskRow,
} from './todo/shared/example-tasks';
export { TaskAssignedNotificationDef } from './todo/shared/task-assigned.notification';
export { TaskCompletedNotificationDef } from './todo/shared/task-completed.notification';
export { TaskListScreenDef } from './todo/shared/task-list.screen';
export { taskState } from './todo/shared/task-state';
export { MainMenuScreenDef } from './todo/start-work/main-menu.screen';
export { StartWorkStoryDef } from './todo/start-work/start-work.story';
export { TodoUiModuleDef } from './todo/todo.ui-module';
export { UsersUiModuleDef } from './users/users.ui-module';
export { UserCardScreenDef } from './users/view-user/user-card.screen';
export { ViewUserStoryDef } from './users/view-user/view-user.story';
