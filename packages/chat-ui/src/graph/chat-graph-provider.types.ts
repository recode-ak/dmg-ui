import type { AnyUiAppDef } from 'dmg-ui';
import type { MessengerCapabilities } from '../messenger/messenger.types';
import type { ChatViews } from '../view/chat-views';

/** Приложение мессенджера в графе: Def, реестр представлений и возможности мессенджера. */
export type ChatAppSpec = {
  readonly app: AnyUiAppDef;
  readonly views: ChatViews;
  readonly capabilities: MessengerCapabilities;
};

/** Сборка поставщика графа общей части мессенджеров: все приложения мессенджеров графа. */
export type ChatGraphSpec = {
  readonly apps: readonly ChatAppSpec[];
};
