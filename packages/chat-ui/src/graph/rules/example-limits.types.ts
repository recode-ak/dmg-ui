import type { AppChatViews } from '../../view/app-chat-views';
import type { ChatExamples } from '../chat-examples';

/** Сборка CH-01: примеры набора и сборки представлений по `id` приложения UI (`UiIds.app`). */
export type ExampleLimitsSpec = {
  readonly examples: ChatExamples;
  readonly views: ReadonlyMap<string, AppChatViews>;
};

/** Ссылка уведомления при мере: `id` экрана-цели и его подпись из графа. */
export type NoticeLink = { readonly screen: string; readonly label: string };
