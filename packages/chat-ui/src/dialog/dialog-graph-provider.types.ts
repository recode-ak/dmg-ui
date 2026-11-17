import type { AnyUiAppDef } from 'dmg-ui';
import type { ChatViews } from '../view/chat-views';

/** Сборка поставщика графа диалогового канала. */
export type DialogGraphSpec = {
  readonly app: AnyUiAppDef;
  readonly views: ChatViews;
};
