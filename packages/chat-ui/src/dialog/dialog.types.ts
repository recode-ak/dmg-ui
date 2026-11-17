import type { Identified } from 'dmg-core';
import type {
  AnyUiAppDef,
  CodeLoaders,
  Place,
  ScreenRuntime,
  UiObserver,
} from 'dmg-ui';
import type { RecipientCallers, UiServer } from 'dmg-ui/server';
import type { ConversationContexts } from '../conversation/conversation.types';
import type { ChatViews } from '../view/chat-views';
import type { DialogTraces } from './dialog-traces';

/** Вариант реплики: короткая ссылка для `press` и подпись. */
export type DialogOption = {
  readonly ref: string;
  readonly label: string;
};

/** Нейтральная реплика диалога: текст и варианты. */
export type DialogReply = {
  readonly text: string;
  readonly options: readonly DialogOption[];
};

/** Место личности: язык и часовой пояс контекста рендера. */
export type DialogPlace = Place;

/** Сборка `DialogChannel`: приложение UI, код, сервер, представления и порты. */
export type DialogChannelSpec<U extends Identified> = {
  readonly app: AnyUiAppDef;
  readonly codes: CodeLoaders;
  readonly server: UiServer<U>;
  readonly views: ChatViews;
  readonly observer: UiObserver;
  /** Порт сборки: вызывающий личности по её `uuid`. */
  readonly identities: (uuid: string) => RecipientCallers<U>;
  /** Id запросов следа; по умолчанию — `crypto.randomUUID`. */
  readonly requestIds?: () => string;
  /** Место личностей; по умолчанию — `ru-RU`, `Asia/Oral`. */
  readonly place?: DialogPlace;
};

/** Всё, что нужно диалогу одной личности; собирает `DialogChannel`. */
export type DialogSpec = {
  readonly app: AnyUiAppDef;
  readonly runtime: ScreenRuntime;
  readonly identity: ConversationContexts;
  readonly traces: DialogTraces;
  readonly views: ChatViews;
  /** uuid личности — собеседник и владелец беседы; по умолчанию — имя канала. */
  readonly person?: string;
};
