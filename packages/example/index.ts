// Вход учебного проекта (D-UI-121): описание UI и сборки кода — модули
// `todo` и `users` поверх учебного приложения `dmg-core`.

export { todoCodes } from './src/frontend/todo/logic';
export { TaskCardScreenCode } from './src/frontend/todo/logic/finish-tasks/task-card.scode';
export { AssignedTasksScreenCode } from './src/frontend/todo/logic/follow-assigned/assigned-tasks.scode';
export { TaskAssignedNotificationCode } from './src/frontend/todo/logic/shared/task-assigned.ncode';
export { TaskCompletedNotificationCode } from './src/frontend/todo/logic/shared/task-completed.ncode';
export { TaskListScreenCode } from './src/frontend/todo/logic/shared/task-list.scode';
export { MainMenuScreenCode } from './src/frontend/todo/logic/start-work/main-menu.scode';
export { usersCodes } from './src/frontend/users/logic';
export { UserCardScreenCode } from './src/frontend/users/logic/view-user/user-card.scode';
export {
  ASSIGNED_ID,
  AssignedTasksScreenDef,
  CARD_ID,
  ExampleUiSetDef,
  exampleSubject,
  FinishTasksStoryDef,
  FollowAssignedStoryDef,
  LIST_ID,
  LIST_START,
  MainMenuScreenDef,
  OWNER,
  PlanTasksStoryDef,
  StartWorkStoryDef,
  TASK_A,
  TASK_B,
  TASK_PAGE_SIZE,
  TaskAssignedNotificationDef,
  TaskCardScreenDef,
  TaskCompletedNotificationDef,
  TaskListScreenDef,
  type TaskRow,
  TodoUiModuleDef,
  taskRow,
  taskState,
  UserCardScreenDef,
  UsersUiModuleDef,
  ViewUserStoryDef,
} from './src/platform/ui';
export {
  type ExampleCodeOverrides,
  exampleCodes,
} from './src/runners/example-codes';
