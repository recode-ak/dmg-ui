import type { AnyUiAppDef } from 'dmg-ui';
import type { MessengerCapabilities } from '../messenger/messenger.types';
import type { ChatViews } from '../view/chat-views';
import type { ChatExamples } from './chat-examples';

/** Приложение мессенджера в графе: Def, реестр представлений и возможности мессенджера. */
export type ChatAppSpec = {
  readonly app: AnyUiAppDef;
  readonly views: ChatViews;
  readonly capabilities: MessengerCapabilities;
};

/** Сборка поставщика графа общей части мессенджеров: все приложения мессенджеров графа и примеры их набора для CH-01. */
export type ChatGraphSpec = {
  readonly apps: readonly ChatAppSpec[];
  readonly examples: ChatExamples;
};
