import type { GraphApp } from 'dmg-core/graph';
import { ExampleAppDef } from 'dmg-core/testing';
import { ChatGraphProvider } from 'dmg-ui/chat-ui';
import { MemoryMessenger } from 'dmg-ui/chat-ui/testing';
import { UiGraphProvider } from 'dmg-ui/graph';
import { ExampleUiSetDef } from '../../platform/ui';
import { EXAMPLE_CHANNELS } from '../example-arch.const';
import { ExampleDialogUiAppDef } from './example-dialog.ui-app';
import { ExampleTrimmedUiAppDef } from './example-trimmed.ui-app';
import { ExampleWindowedUiAppDef } from './example-windowed.ui-app';

/**
 * Вход графа учебного примера без домена: поставщик `dmg-ui` с тремя
 * приложениями и поставщик общей части мессенджеров; у каждого входа — точка
 * входа (CH-02). Лимиты примеров (CH-01) меряет тест сборки представлений
 * (`example-dialog-views.test.ts`), не граф.
 * @see ./example-dialog.arch.test.ts
 */
export const ExampleDialogGraph: GraphApp = {
  def: ExampleAppDef,
  providers: [
    new UiGraphProvider({
      set: ExampleUiSetDef,
      apps: [
        ExampleDialogUiAppDef,
        ExampleTrimmedUiAppDef,
        ExampleWindowedUiAppDef,
      ],
      channels: EXAMPLE_CHANNELS,
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

export default ExampleDialogGraph;
