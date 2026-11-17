import type { AnyUiAppDef } from 'dmg-ui';
import type { MessengerCapabilities } from '../messenger/messenger.types';
import type { ChatViews } from '../view/chat-views';
import type { ChatExamples } from './chat-examples';

/**
 * Точка входа: как человек попадает на вход `entry` приложения. `via`
 * (способ) и `key` (что вводит или нажимает человек) — слова пакета
 * мессенджера, `chat-ui` их не трактует.
 */
export type ChatEntryPointSpec = {
  readonly entry: string;
  readonly via: string;
  readonly key: string;
};

/** Приложение мессенджера в графе: Def, реестр представлений, возможности мессенджера и точки входа. */
export type ChatAppSpec = {
  readonly app: AnyUiAppDef;
  readonly views: ChatViews;
  readonly capabilities: MessengerCapabilities;
  readonly entryPoints?: readonly ChatEntryPointSpec[];
};

/** Сборка поставщика графа общей части мессенджеров: все приложения мессенджеров графа и примеры их набора для CH-01. */
export type ChatGraphSpec = {
  readonly apps: readonly ChatAppSpec[];
  readonly examples: ChatExamples;
};
