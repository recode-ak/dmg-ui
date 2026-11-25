import type { ArchApp } from 'dmg-core/arch';
import { ExampleAppDef } from 'dmg-core/testing';
import { ChatGraphProvider } from 'dmg-ui/chat-ui';
import { UiGraphProvider } from 'dmg-ui/graph';
import { ExampleUiSetDef } from 'dmg-ui/testing';
import { MemoryMessenger } from '../messengers/memory-messenger';
import { ExampleDialogUiAppDef } from './example-dialog.ui-app';
import { ExampleTrimmedUiAppDef } from './example-trimmed.ui-app';
import { ExampleWindowedUiAppDef } from './example-windowed.ui-app';

/**
 * Граф учебного примера без домена: поставщик `dmg-ui` с тремя приложениями и
 * поставщик общей части мессенджеров; у каждого входа — точка входа (CH-02).
 * Лимиты примеров (CH-01) меряет тест сборки представлений
 * (`example-dialog.views.test.ts`), не граф.
 * Канал — `chat`; каталогов слоёв фронта у примера пока нет: его файлы лежат
 * вне слоёв, пока раскладка примера не разделена по слоям.
 * @see ./example-dialog.arch.test.ts
 */
export const ExampleDialogArch: ArchApp = {
  def: ExampleAppDef,
  project: import.meta.dir,
  runners: [],
  layers: {
    ui: [`${import.meta.dir}/platform/ui`],
    'fe-app': [`${import.meta.dir}/frontend/app`],
    'fe-logic': [`${import.meta.dir}/frontend/{m}/logic`],
    'fe-chat': [`${import.meta.dir}/frontend/{m}/chat`],
    'chat-kit': [`${import.meta.dir}/frontend/chat-kit`],
  },
  graphEntry: import.meta.path,
  providers: [
    new UiGraphProvider({
      set: ExampleUiSetDef,
      apps: [
        ExampleDialogUiAppDef,
        ExampleTrimmedUiAppDef,
        ExampleWindowedUiAppDef,
      ],
      channels: [{ name: 'chat' }],
    }),
    new ChatGraphProvider({
      apps: [
        {
          app: ExampleDialogUiAppDef,
          capabilities: MemoryMessenger.editing().capabilities,
          entryPoints: [
            { entry: 'start', via: 'message', key: 'start' },
            { entry: 'assigned', via: 'message', key: 'assigned' },
            { entry: 'menu', via: 'message', key: 'menu' },
          ],
        },
        {
          app: ExampleTrimmedUiAppDef,
          capabilities: MemoryMessenger.editing().capabilities,
          entryPoints: [
            { entry: 'start', via: 'message', key: 'start' },
            { entry: 'assigned', via: 'message', key: 'assigned' },
            { entry: 'menu', via: 'message', key: 'menu' },
          ],
        },
        {
          app: ExampleWindowedUiAppDef,
          capabilities: MemoryMessenger.windowed(() => 0).capabilities,
          entryPoints: [{ entry: 'start', via: 'message', key: 'start' }],
        },
      ],
    }),
  ],
};
