import type { AnyUiAppDef } from 'dmg-ui';
import type { AnyPageRouteDef } from '../url/page-route-def.types';
import type { PageViews } from '../view/page-views';

/** Сборка поставщика графа страничного канала. */
export type PageGraphSpec = {
  readonly app: AnyUiAppDef;
  readonly views: PageViews;
  readonly routes: readonly AnyPageRouteDef[];
};
