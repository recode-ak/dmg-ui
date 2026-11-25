import { describe, expect, it } from 'bun:test';

// Состав входа `dmg-ui/testing` (D-UI-32): помощник рендера примеров,
// наблюдатель в памяти и проверка имён файлов UI (NM-01). Учебный проект —
// вход `dmg-ui/example`; диалог — во входах `chat-ui`, страничный канал — во
// входах `web-ui`. Заглушки портов и сцены правил — внутренние помощники
// тестов ядра.

const keys = async () => Object.keys(await import('dmg-ui/testing'));

describe('вход dmg-ui/testing', () => {
  it('состав входа — точный список имён', async () => {
    expect((await keys()).sort()).toEqual([
      'ExamplePreview',
      'MemoryUiObserver',
      'UiFileNames',
    ]);
  });
});
