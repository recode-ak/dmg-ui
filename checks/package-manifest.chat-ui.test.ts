import { describe, expect, it } from 'bun:test';

// Составы входов диалогового пакета и вход его общих помощников тестов
// (D-UI-32): диалог, сообщение, помощники лимита, страж и схема возможностей
// мессенджера, узел бесед, хранилище бесед в памяти и схема снимка беседы —
// в `dmg-ui/chat-ui`; привязка примера и подставной мессенджер — в
// `dmg-ui/chat-ui/testing`; шесть помощников ядра — в `dmg-ui/testing/fixtures`.

const CHAT_UI = [
  'ChatViews',
  'ConversationSnapshotSchema',
  'Conversations',
  'DIALOG_CHANNEL',
  'DialogChannel',
  'DialogGraphProvider',
  'DialogRenderer',
  'LimitedMessenger',
  'MemoryConversationStore',
  'MessageFit',
  'MessengerCapabilitiesSchema',
  'NotificationPresenter',
  'PlainText',
  'ScreenPresenter',
  'TextBuilder',
  'TextLength',
  'TextSplitter',
  'TextTrimmer',
];

describe('вход dmg-ui/chat-ui', () => {
  it('состав — канал, представления и их реестр с перекрытием, наблюдатели, граф, рендерер, имя канала, сообщение, помощники лимита, страж и схема возможностей, узел бесед, хранилище бесед в памяти и схема снимка', async () => {
    expect(Object.keys(await import('dmg-ui/chat-ui')).sort()).toEqual(CHAT_UI);
  });

  it('имя канала прежнее', async () => {
    const { DIALOG_CHANNEL } = await import('dmg-ui/chat-ui');

    expect(DIALOG_CHANNEL).toBe('dmg-ui-dialog');
  });
});

describe('вход dmg-ui/chat-ui/testing', () => {
  it('состав — привязка учебного примера к диалогу и подставной мессенджер', async () => {
    expect(Object.keys(await import('dmg-ui/chat-ui/testing')).sort()).toEqual([
      'ExampleDialogAppDef',
      'ExampleDialogArch',
      'MemoryMessenger',
      'exampleDialogViews',
    ]);
  });
});

describe('вход dmg-ui/testing/fixtures', () => {
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
  it('пустой каркас — экспортов нет', async () => {
    expect(Object.keys(await import('dmg-ui/tg-bot'))).toEqual([]);
  });
});
