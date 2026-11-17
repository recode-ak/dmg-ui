import type { AnyUiAppDef } from 'dmg-ui';
import type { PageViews } from '../client/page-views';
import type { AnyPageRouteDef } from './page-route-def.types';

/** Сборка поставщика графа страничного канала. */
export type PageGraphSpec = {
  readonly app: AnyUiAppDef;
  readonly views: PageViews;
  readonly routes: readonly AnyPageRouteDef[];
};
