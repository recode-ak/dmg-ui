import { describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '..');

// Состав входа `dmg-ui/testing` (D-UI-32): учебный пример, константы его
// данных, помощник рендера и наблюдатель в памяти; диалог и привязка к нему —
// во входах `chat-ui`, страничный канал и его привязка — во входах `web-ui`.
// Заглушки портов и сцены правил — внутренние помощники тестов ядра.

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
        'MainMenuScreenDef',
        'UsersUiModuleDef',
        'UserCardScreenDef',
        'PlanTasksStoryDef',
        'FinishTasksStoryDef',
        'FollowAssignedStoryDef',
        'StartWorkStoryDef',
        'ViewUserStoryDef',
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

  it('константы данных примера и субъект примеров', async () => {
    expect(await keys()).toEqual(
      expect.arrayContaining([
        'ASSIGNED_ID',
        'CARD_ID',
        'LIST_ID',
        'TASK_A',
        'TASK_B',
        'exampleSubject',
      ]),
    );
  });

  it('страничного канала и его привязки к примеру нет — они во входах web-ui', async () => {
    const page = (name: string) =>
      /^Page/.test(name) ||
      /^Example.*Pages?/.test(name) ||
      /^examplePage/.test(name) ||
      ['PAGE_CHANNEL', 'ClientMessage', 'ServerMessage'].includes(name);

    expect((await keys()).filter(page)).toEqual([]);
  });

  it('каталогов страницы в ядре нет', () => {
    for (const gone of [
      'packages/core/testing/page',
      'packages/core/testing/example/pages',
    ]) {
      expect(existsSync(join(ROOT, gone))).toBe(false);
    }
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
      'requestTrace',
      'exampleUser',
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
