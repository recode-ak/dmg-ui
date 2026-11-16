import type { AnyUiAppDef } from 'dmg-ui';
import type { DialogViews } from './dialog-views';

/** Сборка поставщика графа диалогового канала. */
export type DialogGraphSpec = {
  readonly app: AnyUiAppDef;
  readonly views: DialogViews;
};
