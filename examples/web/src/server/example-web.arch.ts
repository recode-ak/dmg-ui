import type { ArchApp } from 'dmg-core/arch';
import { ExampleArch } from 'dmg-core/testing';
import { UiGraphProvider } from 'dmg-ui/graph';
import { ExampleUiSetDef } from 'dmg-ui/testing';
import { PageGraphProvider } from 'dmg-ui/web-ui';
import {
  ExamplePagesUiAppDef,
  examplePagesRoutes,
} from 'dmg-ui/web-ui/testing';
import { exampleWebViews } from '../view/example-web.views';

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
    new UiGraphProvider({ set: ExampleUiSetDef, apps: [ExamplePagesUiAppDef] }),
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
