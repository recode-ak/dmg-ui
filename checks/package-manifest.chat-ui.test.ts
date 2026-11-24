import { describe, expect, it } from 'bun:test';

// Составы входов диалогового пакета и вход его общих помощников тестов
// (D-UI-32): диалог, сообщение, помощники лимита, страж и схема возможностей
// мессенджера, поставщик графа и примеры для его правил, узел бесед,
// хранилище бесед в памяти, схема снимка беседы и исполнитель сообщества — в `dmg-ui/chat-ui`; привязка примера и подставной мессенджер — в
// `dmg-ui/chat-ui/testing`; десять помощников ядра — в `dmg-ui/testing/fixtures`;
// мессенджер Telegram — в `dmg-ui/tg-bot`, подставной порт Bot API — в
// `dmg-ui/tg-bot/testing`.

const CHAT_UI = [
  'AppChatViews',
  'CHAT_EDGE_KINDS',
  'CHAT_NODE_KINDS',
  'CHAT_PROVIDER',
  'ChatExamples',
  'ChatGraphProvider',
  'ChatViews',
  'Communities',
  'ConversationSnapshotSchema',
  'Conversations',
  'DIALOG_CHANNEL',
  'DialogRenderer',
  'LimitedMessenger',
  'MemoryConversationStore',
  'MessageFit',
  'MessengerCapabilitiesSchema',
  'NotificationPresenter',
  'PlainText',
  'ScreenComposer',
  'ScreenPresenter',
  'TextBuilder',
  'TextLength',
  'TextSplitter',
  'TextTrimmer',
];

describe('вход dmg-ui/chat-ui', () => {
  it('состав — канал, представления и их реестр с перекрытием, наблюдатели, поставщик графа, его имя и примеры для его правил, рендерер, имя канала, сообщение, помощники лимита, страж и схема возможностей, узел бесед, хранилище бесед в памяти, схема снимка и исполнитель сообщества', async () => {
    expect(Object.keys(await import('dmg-ui/chat-ui')).sort()).toEqual(CHAT_UI);
  });

  it('имя канала прежнее', async () => {
    const { DIALOG_CHANNEL } = await import('dmg-ui/chat-ui');

    expect(DIALOG_CHANNEL).toBe('dmg-ui-dialog');
  });

  it('имя поставщика графа — dmg-ui-chat, отдельно от имени канала', async () => {
    const { CHAT_PROVIDER } = await import('dmg-ui/chat-ui');

    expect(CHAT_PROVIDER).toBe('dmg-ui-chat');
  });
});

describe('вход dmg-ui/chat-ui/testing', () => {
  it('состав — привязка учебного примера к диалогу (три приложения) и подставной мессенджер', async () => {
    expect(Object.keys(await import('dmg-ui/chat-ui/testing')).sort()).toEqual([
      'ExampleDialogArch',
      'ExampleDialogUiAppDef',
      'ExampleTrimmedUiAppDef',
      'ExampleWindowedUiAppDef',
      'MemoryMessenger',
      'exampleDialogViews',
      'todoChatViews',
      'usersChatViews',
    ]);
  });
});

describe('вход dmg-ui/testing/fixtures', () => {
  it('состав — ровно десять помощников тестов', async () => {
    expect(Object.keys(await import('dmg-ui/testing/fixtures')).sort()).toEqual(
      [
        'ArchReport',
        'ExampleStubUiAppDef',
        'RuntimeKit',
        'StubViewProvider',
        'T0',
        'UiScene',
        'exampleUser',
        'oplogRecords',
        'requestTrace',
        'testRenderContext',
      ],
    );
  });
});

describe('вход dmg-ui/tg-bot', () => {
  it('состав — виды апдейтов и способы точек входа, возможности Telegram, поставщик графа, меню команд, мессенджер на порту Bot API и приём апдейтов', async () => {
    expect(Object.keys(await import('dmg-ui/tg-bot')).sort()).toEqual([
      'TELEGRAM_ALLOWED_UPDATES',
      'TELEGRAM_CAPABILITIES',
      'TELEGRAM_VIA',
      'TelegramGraphProvider',
      'TelegramMenu',
      'TelegramMessenger',
      'TelegramUpdates',
    ]);
  });
});

describe('вход dmg-ui/tg-bot/testing', () => {
  it('состав — подставной порт Bot API, построитель апдейтов и перекрытие примера под Telegram', async () => {
    expect(Object.keys(await import('dmg-ui/tg-bot/testing')).sort()).toEqual([
      'EXAMPLE_MOMENT',
      'ExampleTelegramPreview',
      'MemoryBotApi',
      'TestUpdates',
      'exampleTelegramViews',
    ]);
  });
});
