// Вход dmg-ui/testing (D-UI-32): учебный пример, помощник рендера примеров и
// наблюдатель в памяти. Привязка примера к страничному каналу — вход
// dmg-ui/web-ui/testing. Заглушки портов, сцены правил графа и заглушки
// сервера — внутренние помощники тестов ядра; общие помощники тестов каналов —
// вход dmg-ui/testing/fixtures.

export {
  ASSIGNED_ID,
  AssignedTasksScreenDef,
  CARD_ID,
  type ExampleCodeOverrides,
  ExampleUiSetDef,
  exampleCodes,
  FinishTasksStoryDef,
  FollowAssignedStoryDef,
  LIST_ID,
  PlanTasksStoryDef,
  TASK_A,
  TASK_B,
  TaskAssignedNotificationDef,
  TaskCardScreenDef,
  TaskCompletedNotificationDef,
  TaskListScreenDef,
  type TaskRow,
  TodoUiModuleDef,
} from './example';
export { MemoryUiObserver } from './memory-ui-observer';
export {
  ExamplePreview,
  type ExamplePreviewSpec,
  type ExampleRenderer,
} from './preview';
