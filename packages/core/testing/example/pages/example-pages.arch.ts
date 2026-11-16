import type { ArchApp } from 'dmg-core/arch';
import { ExampleArch } from 'dmg-core/testing';
import { UiGraphProvider } from 'dmg-ui/graph';
import { PageGraphProvider } from '../../page/graph/page-graph-provider';
import { ExampleUiSetDef } from '../example-ui.set';
import { ExamplePagesAppDef } from './example-pages.app';
import { examplePageRoutes } from './example-pages.routes';
import { examplePageViews } from './example-pages.views';

/** Граф учебного примера на страницах: домен `ExampleArch`, поставщик `dmg-ui` и поставщик страничного канала. */
export const ExamplePagesArch: ArchApp = {
  ...ExampleArch,
  providers: [
    new UiGraphProvider({ set: ExampleUiSetDef, apps: [ExamplePagesAppDef] }),
    new PageGraphProvider({
      app: ExamplePagesAppDef,
      views: examplePageViews,
      routes: examplePageRoutes,
    }),
  ],
};
