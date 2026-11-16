import { describe, expect, it } from 'bun:test';

// Состав входа `dmg-ui/testing` (D-UI-32): учебный пример, помощник рендера
// и наблюдатель в памяти; диалог и привязка к нему — во входах `chat-ui`. Заглушки портов и сцены
// правил — внутренние помощники тестов ядра.

const keys = async () => Object.keys(await import('dmg-ui/testing'));

describe('вход dmg-ui/testing', () => {
  it('учебный пример: Def набора, модуля, экранов, сторис, уведомлений и загрузчики', async () => {
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
      ]),
    );
  });

  it('помощник рендера и наблюдатель', async () => {
    expect(await keys()).toEqual(
      expect.arrayContaining(['ExamplePreview', 'MemoryUiObserver']),
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
      'ExampleStubAppDef',
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
      'T0',
      'oplogRecords',
      'testRenderContext',
      'TaskLines',
    ]) {
      expect(exported).not.toContain(internal);
    }
  });

  it('диалога и его привязки к примеру нет — они во входах chat-ui', async () => {
    const dialog = (name: string) =>
      /^Dialog/.test(name) ||
      /^Example.*Dialog/.test(name) ||
      /^example.*Dialog/.test(name) ||
      ['ScreenPresenter', 'NotificationPresenter', 'DIALOG_CHANNEL'].includes(
        name,
      );

    expect((await keys()).filter(dialog)).toEqual([]);
  });
});
