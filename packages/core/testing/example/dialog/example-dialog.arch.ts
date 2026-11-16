import type { ArchApp } from 'dmg-core/arch';
import { ExampleArch } from 'dmg-core/testing';
import { UiGraphProvider } from 'dmg-ui/graph';
// Временно (K5): рёбра `presents` — тестовое представление «набор целиком».
// Срез 4 заменяет его на `DialogGraphProvider` и снимает исключение зоны
// «привязка примера к каналу» в `checks/core-import-scanner.ts`.
import { StubViewProvider } from '../../ui-graph-fixture';
import { ExampleUiSetDef } from '../example-ui.set';
import { ExampleDialogAppDef } from './example-dialog.app';

/** Граф учебного примера: домен `ExampleArch`, поставщик `dmg-ui` и представления канала. */
export const ExampleDialogArch: ArchApp = {
  ...ExampleArch,
  providers: [
    new UiGraphProvider({ set: ExampleUiSetDef, apps: [ExampleDialogAppDef] }),
    new StubViewProvider(ExampleUiSetDef, ExampleDialogAppDef, [
      ExampleUiSetDef,
    ]),
  ],
};
