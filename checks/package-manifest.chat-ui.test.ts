import { describe, expect, it } from 'bun:test';

// Составы входов диалогового пакета и вход его общих помощников тестов
// (D-UI-32): диалог — в `dmg-ui/chat-ui`, привязка примера — в
// `dmg-ui/chat-ui/testing`, шесть помощников ядра — в `dmg-ui/testing/fixtures`.

const CHAT_UI = [
  'DIALOG_CHANNEL',
  'DialogChannel',
  'DialogGraphProvider',
  'DialogRenderer',
  'DialogViews',
  'NotificationPresenter',
  'ScreenPresenter',
];

describe('вход dmg-ui/chat-ui', () => {
  it('резолвится по имени пакета', async () => {
    expect(await import('dmg-ui/chat-ui')).toBeDefined();
  });

  it('состав — канал, представления, наблюдатели, граф, рендерер и имя канала', async () => {
    expect(Object.keys(await import('dmg-ui/chat-ui')).sort()).toEqual(CHAT_UI);
  });

  it('имя канала прежнее', async () => {
    const { DIALOG_CHANNEL } = await import('dmg-ui/chat-ui');

    expect(DIALOG_CHANNEL).toBe('dmg-ui-dialog');
  });

  it('dmg-ui/testing не содержит ни одного имени dmg-ui/chat-ui', async () => {
    const testing = Object.keys(await import('dmg-ui/testing'));

    expect(testing.filter((name) => CHAT_UI.includes(name))).toEqual([]);
  });
});

describe('вход dmg-ui/chat-ui/testing', () => {
  it('резолвится по имени пакета', async () => {
    expect(await import('dmg-ui/chat-ui/testing')).toBeDefined();
  });

  it('состав — привязка учебного примера к диалогу', async () => {
    expect(Object.keys(await import('dmg-ui/chat-ui/testing')).sort()).toEqual([
      'ExampleDialogAppDef',
      'ExampleDialogArch',
      'exampleDialogViews',
    ]);
  });
});

describe('вход dmg-ui/testing/fixtures', () => {
  it('резолвится по имени пакета', async () => {
    expect(await import('dmg-ui/testing/fixtures')).toBeDefined();
  });

  it('состав — ровно шесть помощников тестов', async () => {
    expect(Object.keys(await import('dmg-ui/testing/fixtures')).sort()).toEqual(
      [
        'ArchReport',
        'RuntimeKit',
        'StubViewProvider',
        'T0',
        'oplogRecords',
        'testRenderContext',
      ],
    );
  });
});

describe('вход dmg-ui/tg-bot', () => {
  it('резолвится по имени пакета', async () => {
    expect(await import('dmg-ui/tg-bot')).toBeDefined();
  });

  it('пустой каркас — экспортов нет', async () => {
    expect(Object.keys(await import('dmg-ui/tg-bot'))).toEqual([]);
  });
});
