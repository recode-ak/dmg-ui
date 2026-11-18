import type { ArchApp } from 'dmg-core/arch';
import { ExampleArch } from 'dmg-core/testing';
import { UiGraphProvider } from 'dmg-ui/graph';
import { ExampleUiSetDef } from 'dmg-ui/testing';
import { PageGraphProvider } from 'dmg-ui/web-ui';
import { ExamplePagesAppDef, examplePageRoutes } from 'dmg-ui/web-ui/testing';
import { exampleWebViews } from '../view/example-views';

/**
 * Граф примера для браузера: домен учебного приложения, поставщик `dmg-ui` и
 * поставщик страничного канала с реестром представлений на DOM. Реестр
 * структурно подходит графу (`set`, `presented()`): ребро `presents` у каждого
 * экрана и уведомления одно. Текстовый набор представлений остаётся в графе
 * учебного примера страниц — это другой граф для другого теста.
 */
export const ExampleWebArch: ArchApp = {
  ...ExampleArch,
  providers: [
    new UiGraphProvider({ set: ExampleUiSetDef, apps: [ExamplePagesAppDef] }),
    new PageGraphProvider({
      apps: [
        {
          app: ExamplePagesAppDef,
          views: exampleWebViews,
          routes: examplePageRoutes,
        },
      ],
    }),
  ],
};
