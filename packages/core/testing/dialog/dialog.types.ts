import type { Identified, Trace } from 'dmg-core';
import type {
  ActionField,
  AddressJson,
  AnyUiAppDef,
  Choice,
  CodeLoaders,
  RenderContext,
  ScreenInstance,
  ScreenRuntime,
  UiObserver,
} from 'dmg-ui';
import type { RecipientCallers, UiServer } from 'dmg-ui/server';
import type { DialogReplies } from './dialog-replies';
import type { DialogTraces } from './dialog-traces';
import type { DialogViews } from './dialog-views';
import type { InputDraft } from './input-draft';

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
export type DialogPlace = {
  readonly locale: string;
  readonly timeZone: string;
};

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

/** Контекст рендера личности на входящий сигнал. */
export type RenderContexts = {
  context(trace: Trace): Promise<RenderContext>;
};

/** Всё, что нужно диалогу одной личности; собирает `DialogChannel`. */
export type DialogSpec = {
  readonly app: AnyUiAppDef;
  readonly runtime: ScreenRuntime;
  readonly identity: RenderContexts;
  readonly traces: DialogTraces;
  readonly replies: DialogReplies;
};

/** Цель ссылки, вход которой собирается по шагам. */
export type DraftTarget = Extract<RefTarget, { kind: 'action' | 'local' }>;

/** Цель ссылки: что сделать по нажатию варианта. */
export type RefTarget =
  | {
      readonly kind: 'action';
      readonly instance: ScreenInstance;
      readonly revision: number;
      readonly action: string;
      readonly fields: readonly ActionField[];
    }
  | {
      readonly kind: 'local';
      readonly instance: ScreenInstance;
      readonly local: string;
      readonly fields: readonly ActionField[];
    }
  | {
      readonly kind: 'choice';
      readonly draft: InputDraft;
      /** Поле шага, на котором выдан вариант. */
      readonly field: string;
      readonly value: Choice['value'];
    }
  | {
      readonly kind: 'skip';
      readonly draft: InputDraft;
      readonly field: string;
    }
  | {
      readonly kind: 'confirm';
      readonly yes: boolean;
      readonly instance: ScreenInstance;
      readonly revision: number;
      readonly action: string;
      readonly input: unknown;
    }
  | { readonly kind: 'open'; readonly address: AddressJson };

/** Вариант вида без ссылки: действие, локальное действие или «Повторить». */
export type ViewOption =
  | {
      readonly kind: 'action' | 'local';
      readonly name: string;
      readonly label: string;
      readonly fields: readonly ActionField[];
    }
  | { readonly kind: 'retry'; readonly label: string };

/** Исполнение действия: экземпляр, ревизия вида и имя. */
export type ActTarget = {
  readonly instance: ScreenInstance;
  readonly revision: number;
  readonly action: string;
};

/** Черновик входа и цель, которой он соберётся. */
export type ActiveDraft = {
  readonly draft: InputDraft;
  readonly target: DraftTarget;
};
