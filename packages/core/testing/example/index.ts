// Учебный пример: набор UI поверх учебного приложения `dmg-core` и
// загрузчики кода; его собирает вход `dmg-ui/testing` (`testing/index.ts`).

export { type ExampleCodeOverrides, exampleCodes } from './example-codes';
export { ExampleUiSetDef } from './example-ui.set';
export { AssignedTasksScreenDef } from './todo/assigned-tasks.screen';
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
} from './todo/example-tasks';
export { FinishTasksStoryDef } from './todo/finish-tasks.story';
export { FollowAssignedStoryDef } from './todo/follow-assigned.story';
export { PlanTasksStoryDef } from './todo/plan-tasks.story';
export { TaskAssignedNotificationDef } from './todo/task-assigned.notification';
export { TaskCardScreenDef } from './todo/task-card.screen';
export { TaskCompletedNotificationDef } from './todo/task-completed.notification';
export { TaskListScreenDef } from './todo/task-list.screen';
export { TodoUiModuleDef } from './todo/todo.ui-module';
