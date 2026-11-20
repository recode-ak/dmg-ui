import { describe, expect, it } from 'bun:test';

// Состав входа `dmg-ui/testing` (D-UI-32): учебный пример, константы его
// данных, помощник рендера и наблюдатель в памяти; диалог и привязка к нему —
// во входах `chat-ui`, страничный канал и его привязка — во входах `web-ui`.
// Заглушки портов и сцены правил — внутренние помощники тестов ядра.

const keys = async () => Object.keys(await import('dmg-ui/testing'));

describe('вход dmg-ui/testing', () => {
  it('состав входа — точный список имён', async () => {
    expect((await keys()).sort()).toEqual([
      'ASSIGNED_ID',
      'AssignedTasksScreenDef',
      'CARD_ID',
      'ExamplePreview',
      'ExampleUiSetDef',
      'FinishTasksStoryDef',
      'FollowAssignedStoryDef',
      'LIST_ID',
      'MainMenuScreenDef',
      'MemoryUiObserver',
      'PlanTasksStoryDef',
      'StartWorkStoryDef',
      'TASK_A',
      'TASK_B',
      'TaskAssignedNotificationDef',
      'TaskCardScreenDef',
      'TaskCompletedNotificationDef',
      'TaskListScreenDef',
      'TodoUiModuleDef',
      'UserCardScreenDef',
      'UsersUiModuleDef',
      'ViewUserStoryDef',
      'exampleCodes',
      'exampleSubject',
    ]);
  });
});
