import type { ArchApp } from 'dmg-core/arch';
import { ExampleArch } from 'dmg-core/testing';
import { DialogGraphProvider } from 'dmg-ui/chat-ui';
import { UiGraphProvider } from 'dmg-ui/graph';
import { ExampleUiSetDef } from 'dmg-ui/testing';
import { ExampleDialogAppDef } from './example-dialog.app';
import { exampleDialogViews } from './example-dialog.views';

/** Граф учебного примера: домен `ExampleArch`, поставщик `dmg-ui` и поставщик диалогового канала. */
export const ExampleDialogArch: ArchApp = {
  ...ExampleArch,
  providers: [
    new UiGraphProvider({ set: ExampleUiSetDef, apps: [ExampleDialogAppDef] }),
    new DialogGraphProvider({
      app: ExampleDialogAppDef,
      views: exampleDialogViews,
    }),
  ],
};
