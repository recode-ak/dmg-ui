// Вход dmg-ui/testing (С-4 фазы 5): учебный пример, учебный диалоговый канал,
// помощник рендера примеров и наблюдатель в памяти. Заглушки портов, сцены
// правил графа и заглушки сервера — внутренние помощники тестов ядра.

export {
  DIALOG_CHANNEL,
  type Dialog,
  DialogChannel,
  type DialogChannelSpec,
  DialogGraphProvider,
  type DialogGraphSpec,
  type DialogOption,
  type DialogPlace,
  DialogRenderer,
  type DialogReply,
  DialogViews,
  NotificationPresenter,
  ScreenPresenter,
} from './dialog';
export {
  AssignedTasksScreenDef,
  type ExampleCodeOverrides,
  ExampleDialogAppDef,
  ExampleDialogArch,
  ExampleUiSetDef,
  exampleCodes,
  exampleDialogViews,
  FinishTasksStoryDef,
  FollowAssignedStoryDef,
  PlanTasksStoryDef,
  TaskAssignedNotificationDef,
  TaskCardScreenDef,
  TaskCompletedNotificationDef,
  TaskListScreenDef,
  TodoUiModuleDef,
} from './example';
export { MemoryUiObserver } from './memory-ui-observer';
export {
  ExamplePreview,
  type ExamplePreviewSpec,
  type ExampleRenderer,
} from './preview';
