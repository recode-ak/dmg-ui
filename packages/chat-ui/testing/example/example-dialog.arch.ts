import type { ArchApp } from 'dmg-core/arch';
import { ExampleArch } from 'dmg-core/testing';
import { ChatExamples, ChatGraphProvider } from 'dmg-ui/chat-ui';
import { UiGraphProvider } from 'dmg-ui/graph';
import { ExampleUiSetDef, exampleCodes } from 'dmg-ui/testing';
import { MemoryMessenger } from '../messengers/memory-messenger';
import { ExampleDialogAppDef } from './example-dialog.app';
import { exampleDialogViews } from './example-dialog.views';
import { ExampleTrimmedDialogAppDef } from './example-trimmed.app';
import { ExampleWindowedAppDef } from './example-windowed.app';

/** Примеры учебного набора для CH-01: собираются до графа (`await` на верхнем уровне). */
const examples = await ChatExamples.collect({
  set: ExampleUiSetDef,
  codes: exampleCodes(),
});

/**
 * Граф учебного примера: домен `ExampleArch`, поставщик `dmg-ui` с тремя
 * приложениями и один поставщик общей части мессенджеров — `exampleDialog`
 * и урезанное `exampleTrimmed` на мессенджере с правкой, `exampleWindowed` —
 * без правки, с окном; у каждого входа — точка входа (CH-02).
 */
export const ExampleDialogArch: ArchApp = {
  ...ExampleArch,
  providers: [
    new UiGraphProvider({
      set: ExampleUiSetDef,
      apps: [
        ExampleDialogAppDef,
        ExampleTrimmedDialogAppDef,
        ExampleWindowedAppDef,
      ],
    }),
    new ChatGraphProvider({
      apps: [
        {
          app: ExampleDialogAppDef,
          views: exampleDialogViews,
          capabilities: MemoryMessenger.editing().capabilities,
          entryPoints: [
            { entry: 'start', via: 'message', key: 'start' },
            { entry: 'assigned', via: 'message', key: 'assigned' },
          ],
        },
        {
          app: ExampleTrimmedDialogAppDef,
          views: exampleDialogViews,
          capabilities: MemoryMessenger.editing().capabilities,
          entryPoints: [
            { entry: 'start', via: 'message', key: 'start' },
            { entry: 'assigned', via: 'message', key: 'assigned' },
          ],
        },
        {
          app: ExampleWindowedAppDef,
          views: exampleDialogViews,
          capabilities: MemoryMessenger.windowed(() => 0).capabilities,
          entryPoints: [{ entry: 'start', via: 'message', key: 'start' }],
        },
      ],
      examples,
    }),
  ],
};
