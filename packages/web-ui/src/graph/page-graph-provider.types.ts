import type { AnyUiAppDef, AnyUiSetDef } from 'dmg-ui';
import type { AnyPageRouteDef } from '../url/page-route-def.types';

/** Что граф берёт у сборки представлений: набор и экраны, у которых есть представление. */
export type PagePresentedViews = {
  readonly set: AnyUiSetDef;
  presented(): readonly string[];
};

/** Одно приложение web в графе: приложение UI, сборка представлений и маршруты. */
export type PageAppSpec = {
  readonly app: AnyUiAppDef;
  readonly views: PagePresentedViews;
  readonly routes: readonly AnyPageRouteDef[];
};

/** Сборка поставщика графа страничного канала — все приложения web разом. */
export type PageGraphSpec = {
  readonly apps: readonly PageAppSpec[];
};
