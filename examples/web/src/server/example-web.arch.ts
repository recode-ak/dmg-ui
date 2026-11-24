import type { ArchApp } from 'dmg-core/arch';
import { ExampleAppDef } from 'dmg-core/testing';
import { UiGraphProvider } from 'dmg-ui/graph';
import { ExampleUiSetDef } from 'dmg-ui/testing';
import { PageGraphProvider } from 'dmg-ui/web-ui';
import {
  ExamplePagesUiAppDef,
  examplePagesRoutes,
} from 'dmg-ui/web-ui/testing';
import { exampleWebViews } from '../view/example-web.views';

/**
 * Граф примера для браузера без домена: поставщик `dmg-ui` и поставщик
 * страничного канала с реестром представлений на DOM — реестр структурно
 * подходит графу (`set`, `presented()`); текстовый набор представлений — в
 * графе примера страниц, для другого теста. Канал — `web`; каталогов слоёв
 * фронта у примера пока нет: его файлы лежат вне слоёв.
 * @see ./example-web.arch.test.ts
 */
export const ExampleWebArch: ArchApp = {
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
          views: exampleWebViews,
          routes: examplePagesRoutes,
        },
      ],
    }),
  ],
};
