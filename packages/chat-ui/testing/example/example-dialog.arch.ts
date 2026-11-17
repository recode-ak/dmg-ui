import type { ArchApp } from 'dmg-core/arch';
import { ExampleArch } from 'dmg-core/testing';
import { ChatGraphProvider } from 'dmg-ui/chat-ui';
import { UiGraphProvider } from 'dmg-ui/graph';
import { ExampleUiSetDef } from 'dmg-ui/testing';
import { MemoryMessenger } from '../messengers/memory-messenger';
import { ExampleDialogAppDef } from './example-dialog.app';
import { exampleDialogViews } from './example-dialog.views';
import { ExampleWindowedAppDef } from './example-windowed.app';

/**
 * Граф учебного примера: домен `ExampleArch`, поставщик `dmg-ui` с двумя
 * приложениями и один поставщик общей части мессенджеров — `exampleDialog`
 * на мессенджере с правкой, `exampleWindowed` — без правки, с окном.
 */
export const ExampleDialogArch: ArchApp = {
  ...ExampleArch,
  providers: [
    new UiGraphProvider({
      set: ExampleUiSetDef,
      apps: [ExampleDialogAppDef, ExampleWindowedAppDef],
    }),
    new ChatGraphProvider({
      apps: [
        {
          app: ExampleDialogAppDef,
          views: exampleDialogViews,
          capabilities: MemoryMessenger.editing().capabilities,
        },
        {
          app: ExampleWindowedAppDef,
          views: exampleDialogViews,
          capabilities: MemoryMessenger.windowed(() => 0).capabilities,
        },
      ],
    }),
  ],
};
