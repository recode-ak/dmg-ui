import type { ChatViews } from '../../view/chat-views';
import type { ChatExamples } from '../chat-examples';

/** Сборка CH-01: примеры набора и реестры представлений по `id` приложения UI (`UiIds.app`). */
export type ExampleLimitsSpec = {
  readonly examples: ChatExamples;
  readonly views: ReadonlyMap<string, ChatViews>;
};

/** Ссылка уведомления при мере: `id` экрана-цели и его подпись из графа. */
export type NoticeLink = { readonly screen: string; readonly label: string };
