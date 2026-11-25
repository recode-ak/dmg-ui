// Вход dmg-ui/testing (D-UI-32): учебный пример, помощник рендера примеров,
// наблюдатель в памяти и проверка имён файлов UI (NM-01, D-UI-112). Привязка
// примера к страничному каналу — вход dmg-ui/web-ui/testing. Заглушки портов,
// сцены правил графа и заглушки сервера — внутренние помощники тестов ядра;
// общие помощники тестов каналов — вход dmg-ui/testing/fixtures.

export {
  ASSIGNED_ID,
  AssignedTasksScreenDef,
  CARD_ID,
  type ExampleCodeOverrides,
  ExampleUiSetDef,
  exampleCodes,
  exampleSubject,
  FinishTasksStoryDef,
  FollowAssignedStoryDef,
  LIST_ID,
  MainMenuScreenDef,
  PlanTasksStoryDef,
  StartWorkStoryDef,
  TASK_A,
  TASK_B,
  TaskAssignedNotificationDef,
  TaskCardScreenDef,
  TaskCompletedNotificationDef,
  TaskListScreenDef,
  type TaskRow,
  TodoUiModuleDef,
  UserCardScreenDef,
  UsersUiModuleDef,
  ViewUserStoryDef,
} from 'dmg-ui/example';
export { MemoryUiObserver } from './memory-ui-observer';
export {
  ExamplePreview,
  type ExamplePreviewSpec,
  type ExampleRenderer,
} from './preview';
export { UiFileNames } from './ui-file-names';
export type {
  UiNamesLayout,
  UiNamesSource,
  UiNamesViolation,
} from './ui-file-names.types';
