import type { GraphApp } from 'dmg-core/graph';
import { ExampleAppDef } from 'dmg-core/testing';
import { UiGraphProvider } from 'dmg-ui/graph';
import { PageGraphProvider } from 'dmg-ui/web-ui';
import { ExampleUiSetDef } from '../../platform/ui';
import { EXAMPLE_CHANNELS } from '../example-arch.const';
import { examplePagesRoutes } from './example-pages.routes';
import { ExamplePagesUiAppDef } from './example-pages.ui-app';

/**
 * Вход графа учебного примера для браузера без домена: поставщик `dmg-ui` и
 * поставщик страничного канала с маршрутами; представлений граф не видит —
 * полноту сборки на DOM держит её конструктор.
 * @see ./example-web.arch.test.ts
 */
export const ExampleWebGraph: GraphApp = {
  def: ExampleAppDef,
  providers: [
    new UiGraphProvider({
      set: ExampleUiSetDef,
      apps: [ExamplePagesUiAppDef],
      channels: EXAMPLE_CHANNELS,
    }),
    new PageGraphProvider({
      apps: [
        {
          app: ExamplePagesUiAppDef,
          routes: examplePagesRoutes,
        },
      ],
    }),
  ],
};

export default ExampleWebGraph;
