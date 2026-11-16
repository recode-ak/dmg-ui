import { describe, expect, it } from 'bun:test';

// Состав входа `dmg-ui/testing` (С-4 фазы 5): учебный пример, диалоговый
// канал, помощник рендера и наблюдатель в памяти. Заглушки портов и сцены
// правил — внутренние помощники тестов ядра.

const keys = async () => Object.keys(await import('dmg-ui/testing'));

describe('вход dmg-ui/testing', () => {
  it('учебный пример: Def набора, модуля, экранов, сторис, уведомлений, загрузчики и привязка к каналу', async () => {
    expect(await keys()).toEqual(
      expect.arrayContaining([
        'ExampleUiSetDef',
        'TodoUiModuleDef',
        'TaskListScreenDef',
        'TaskCardScreenDef',
        'AssignedTasksScreenDef',
        'PlanTasksStoryDef',
        'FinishTasksStoryDef',
        'FollowAssignedStoryDef',
        'TaskAssignedNotificationDef',
        'TaskCompletedNotificationDef',
        'exampleCodes',
        'ExampleDialogAppDef',
        'exampleDialogViews',
        'ExampleDialogArch',
      ]),
    );
  });

  it('диалоговый канал, помощник рендера и наблюдатель', async () => {
    expect(await keys()).toEqual(
      expect.arrayContaining([
        'DialogChannel',
        'DialogViews',
        'ScreenPresenter',
        'NotificationPresenter',
        'DialogGraphProvider',
        'DialogRenderer',
        'ExamplePreview',
        'MemoryUiObserver',
      ]),
    );
  });

  it('страничный канал и привязка примера к нему', async () => {
    expect(await keys()).toEqual(
      expect.arrayContaining([
        'PAGE_CHANNEL',
        'PageWire',
        'PageClient',
        'PageHost',
        'PageViews',
        'PagePresenter',
        'PageNotePresenter',
        'PageRenderer',
        'PageGraphProvider',
        'PageRouteDef',
        'ClientMessage',
        'ServerMessage',
        'ExamplePagesAppDef',
        'examplePageViews',
        'examplePageRoutes',
        'ExamplePagesArch',
      ]),
    );
  });

  it('заглушки портов, сцены правил и заглушки сервера не экспортируются', async () => {
    const exported = await keys();

    for (const internal of [
      'StubUcPort',
      'StubRefreshPort',
      'RuntimeKit',
      'jsonPorts',
      'UiScene',
      'ArchReport',
      'StubViewProvider',
      'StubSignalProvider',
      'StubTransport',
      'StubCallerSource',
      'StubRecipientCallers',
      'StubDelivery',
      'WirePorts',
      'PageConnection',
      'PageRegions',
      'PageForms',
    ]) {
      expect(exported).not.toContain(internal);
    }
  });
});
