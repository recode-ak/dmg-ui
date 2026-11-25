// Вход учебного проекта (D-UI-121): описание UI и сборки кода модулей `todo`
// и `users` поверх учебного приложения `dmg-core`, реестры представлений
// каналов и оболочки раннеров — граф `dialog`, бот Telegram и страницы.

export { todoChatViews } from './src/frontend/todo/chat';
export { todoCodes } from './src/frontend/todo/logic';
export { TaskCardScreenCode } from './src/frontend/todo/logic/finish-tasks/task-card.scode';
export { AssignedTasksScreenCode } from './src/frontend/todo/logic/follow-assigned/assigned-tasks.scode';
export { TaskAssignedNotificationCode } from './src/frontend/todo/logic/shared/task-assigned.ncode';
export { TaskCompletedNotificationCode } from './src/frontend/todo/logic/shared/task-completed.ncode';
export { TaskListScreenCode } from './src/frontend/todo/logic/shared/task-list.scode';
export { MainMenuScreenCode } from './src/frontend/todo/logic/start-work/main-menu.scode';
export { usersChatViews } from './src/frontend/users/chat';
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
export { ExampleDialogArch } from './src/runners/dialog/example-dialog.arch';
export { ExampleDialogUiAppDef } from './src/runners/dialog/example-dialog.ui-app';
export { exampleDialogViews } from './src/runners/dialog/example-dialog-views';
export { ExampleTrimmedUiAppDef } from './src/runners/dialog/example-trimmed.ui-app';
export { ExampleWindowedUiAppDef } from './src/runners/dialog/example-windowed.ui-app';
export {
  type ExampleCodeOverrides,
  exampleCodes,
} from './src/runners/example-codes';
export { ExampleTelegramPreview } from './src/runners/tg-bot/example-telegram-preview';
export { exampleTelegramViews } from './src/runners/tg-bot/example-telegram-views';
export { examplePagesRoutes } from './src/runners/web/example-pages.routes';
export { ExamplePagesUiAppDef } from './src/runners/web/example-pages.ui-app';
export { exampleSubjectWire } from './src/runners/web/example-subject.wire';
export { ExampleWebArch } from './src/runners/web/example-web.arch';
export { exampleWindowPlacements } from './src/runners/web/example-window.placements';
