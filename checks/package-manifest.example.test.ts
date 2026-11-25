import { describe, expect, it } from 'bun:test';

// Состав входа `dmg-ui/example` (D-UI-121): учебный проект поверх учебного
// приложения `dmg-core` — описание UI и константы его данных, код модулей
// `todo` и `users` и их сборка, реестры видов диалогового канала и оболочки
// раннеров `dialog`, `tg-bot`, `web`. Вход видит только тестовый код пакетов.

/** Описание UI: набор, модули, сторис, экраны, уведомления, данные примера. */
const UI = [
  'ASSIGNED_ID',
  'AssignedTasksScreenDef',
  'CARD_ID',
  'ExampleUiSetDef',
  'FinishTasksStoryDef',
  'FollowAssignedStoryDef',
  'LIST_ID',
  'LIST_START',
  'MainMenuScreenDef',
  'OWNER',
  'PlanTasksStoryDef',
  'StartWorkStoryDef',
  'TASK_A',
  'TASK_B',
  'TASK_PAGE_SIZE',
  'TaskAssignedNotificationDef',
  'TaskCardScreenDef',
  'TaskCompletedNotificationDef',
  'TaskListScreenDef',
  'TodoUiModuleDef',
  'UserCardScreenDef',
  'UsersUiModuleDef',
  'ViewUserStoryDef',
  'exampleSubject',
  'taskRow',
  'taskState',
];

/** Код модулей: реестры, классы кода экранов и уведомлений, сборка обоих модулей. */
const CODE = [
  'AssignedTasksScreenCode',
  'MainMenuScreenCode',
  'TaskAssignedNotificationCode',
  'TaskCardScreenCode',
  'TaskCompletedNotificationCode',
  'TaskListScreenCode',
  'UserCardScreenCode',
  'exampleCodes',
  'todoCodes',
  'usersCodes',
];

/** Реестры видов модулей в диалоговом канале. */
const CHANNELS = ['todoChatViews', 'usersChatViews'];

/** Оболочки раннеров: графы, приложения UI, сборки видов, маршруты, провод, раскладки, превью Telegram. */
const RUNNERS = [
  'ExampleDialogArch',
  'ExampleDialogUiAppDef',
  'ExamplePagesUiAppDef',
  'ExampleTelegramPreview',
  'ExampleTrimmedUiAppDef',
  'ExampleWebArch',
  'ExampleWindowedUiAppDef',
  'exampleDialogViews',
  'examplePagesRoutes',
  'exampleSubjectWire',
  'exampleTelegramViews',
  'exampleWindowPlacements',
];

describe('вход dmg-ui/example', () => {
  it('состав — описание, код модулей и их сборка, реестры диалога, оболочки раннеров', async () => {
    expect(Object.keys(await import('dmg-ui/example')).sort()).toEqual(
      [...UI, ...CODE, ...CHANNELS, ...RUNNERS].sort(),
    );
  });
});
