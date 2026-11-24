import type { ArchApp } from 'dmg-core/arch';
import { ExampleAppDef } from 'dmg-core/testing';
import { UiGraphProvider } from 'dmg-ui/graph';
import { ExampleUiSetDef } from 'dmg-ui/testing';
import { PageGraphProvider } from 'dmg-ui/web-ui';
import { examplePagesRoutes } from './example-pages.routes';
import { ExamplePagesUiAppDef } from './example-pages.ui-app';
import { examplePagesViews } from './example-pages.views';

/**
 * Граф учебного примера на страницах без домена: учебное приложение,
 * поставщик `dmg-ui` и поставщик страничного канала. Проект — каталог
 * примера, вход графа — этот файл.
 */
export const ExamplePagesArch: ArchApp = {
  def: ExampleAppDef,
  project: import.meta.dir,
  runners: [],
  graphEntry: import.meta.path,
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
