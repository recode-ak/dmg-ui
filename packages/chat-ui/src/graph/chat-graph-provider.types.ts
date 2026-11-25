import type { AnyUiAppDef } from 'dmg-ui';
import type { ChatCommunitySpec } from '../community/community.types';
import type { MessengerCapabilities } from '../messenger/messenger.types';

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

/** Точка входа с номером внутри её входа, с 1, в порядке `entryPoints`. */
export type NumberedEntryPoint = {
  readonly point: ChatEntryPointSpec;
  readonly n: number;
};

/** Приложение мессенджера в графе: Def, возможности мессенджера, точки входа и манифесты сообщества. */
export type ChatAppSpec = {
  readonly app: AnyUiAppDef;
  readonly capabilities: MessengerCapabilities;
  readonly entryPoints?: readonly ChatEntryPointSpec[];
  readonly community?: ChatCommunitySpec;
};

/** Сборка поставщика графа общей части мессенджеров: все приложения мессенджеров графа. */
export type ChatGraphSpec = {
  readonly apps: readonly ChatAppSpec[];
};
