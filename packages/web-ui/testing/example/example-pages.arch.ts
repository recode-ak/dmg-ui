import type { ArchApp } from 'dmg-core/arch';
import { ExampleAppDef } from 'dmg-core/testing';
import { UiGraphProvider } from 'dmg-ui/graph';
import { ExampleUiSetDef } from 'dmg-ui/testing';
import { PageGraphProvider } from 'dmg-ui/web-ui';
import { examplePagesRoutes } from './example-pages.routes';
import { ExamplePagesUiAppDef } from './example-pages.ui-app';
import { examplePagesViews } from './example-pages.views';

/**
 * Граф учебного примера на страницах без домена: поставщик `dmg-ui` и
 * поставщик страничного канала. Канал — `web`; каталогов слоёв фронта у
 * примера пока нет: его файлы лежат вне слоёв, пока раскладка примера не
 * разделена по слоям.
 */
export const ExamplePagesArch: ArchApp = {
  def: ExampleAppDef,
  project: import.meta.dir,
  runners: [],
  layers: {
    ui: [`${import.meta.dir}/platform/ui`],
    'fe-app': [`${import.meta.dir}/frontend/app`],
    'fe-logic': [`${import.meta.dir}/frontend/{m}/logic`],
    'fe-web': [`${import.meta.dir}/frontend/{m}/web`],
    'web-kit': [`${import.meta.dir}/frontend/web-kit`],
  },
  graphEntry: import.meta.path,
  providers: [
    new UiGraphProvider({
      set: ExampleUiSetDef,
      apps: [ExamplePagesUiAppDef],
      channels: [{ name: 'web' }],
    }),
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
