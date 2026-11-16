import type { AnyUiAppDef } from '../manifest/ui-app-def.types';
import type { AnyUiSetDef } from '../manifest/ui-set-def.types';

/** Что описывает поставщик: набор UI и его приложения UI. */
export type UiGraphSpec = {
  readonly set: AnyUiSetDef;
  readonly apps: readonly AnyUiAppDef[];
};
