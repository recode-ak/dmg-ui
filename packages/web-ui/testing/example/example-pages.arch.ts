import type { ArchApp } from 'dmg-core/arch';
import { ExampleArch } from 'dmg-core/testing';
import { UiGraphProvider } from 'dmg-ui/graph';
import { ExampleUiSetDef } from 'dmg-ui/testing';
import { PageGraphProvider } from 'dmg-ui/web-ui';
import { examplePagesRoutes } from './example-pages.routes';
import { ExamplePagesUiAppDef } from './example-pages.ui-app';
import { examplePagesViews } from './example-pages.views';

/** Граф учебного примера на страницах: домен `ExampleArch`, поставщик `dmg-ui` и поставщик страничного канала. */
export const ExamplePagesArch: ArchApp = {
  ...ExampleArch,
  providers: [
    new UiGraphProvider({ set: ExampleUiSetDef, apps: [ExamplePagesUiAppDef] }),
    new PageGraphProvider({
      apps: [
        {
          app: ExamplePagesUiAppDef,
          views: examplePagesViews,
          routes: examplePagesRoutes,
        },
      ],
    }),
  ],
};
