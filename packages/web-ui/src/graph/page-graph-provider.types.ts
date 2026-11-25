import type { AnyUiAppDef } from 'dmg-ui';
import type { AnyPageRouteDef } from '../url/page-route-def.types';

/** Одно приложение web в графе: приложение UI и маршруты. */
export type PageAppSpec = {
  readonly app: AnyUiAppDef;
  readonly routes: readonly AnyPageRouteDef[];
};

/** Сборка поставщика графа страничного канала — все приложения web разом. */
export type PageGraphSpec = {
  readonly apps: readonly PageAppSpec[];
};
