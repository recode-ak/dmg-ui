import type { Identified } from 'dmg-core';
import type {
  ActionField,
  AnyUiAppDef,
  CodeLoaders,
  Place,
  ScreenRuntime,
  UiObserver,
} from 'dmg-ui';
import type { RecipientCallers, UiServer } from 'dmg-ui/server';
import type { ConversationContexts } from '../conversation/conversation.types';
import type { DialogReplies } from './dialog-replies';
import type { DialogTraces } from './dialog-traces';
import type { DialogViews } from './dialog-views';

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
  readonly views: DialogViews;
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
  readonly replies: DialogReplies;
  /** uuid личности — собеседник и владелец беседы; по умолчанию — имя канала. */
  readonly person?: string;
};

/** Вариант вида без ссылки: действие, локальное действие или «Повторить». */
export type ViewOption =
  | {
      readonly kind: 'action' | 'local';
      readonly name: string;
      readonly label: string;
      readonly fields: readonly ActionField[];
    }
  | { readonly kind: 'retry'; readonly label: string };
