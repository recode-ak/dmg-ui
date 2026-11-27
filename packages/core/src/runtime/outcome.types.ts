import type { AddressJson } from '../address/address-codec.types';
import type {
  AnyScreenDef,
  DataOf,
  ItemTexts,
  StateOf,
} from '../manifest/screen-def.types';
import type { FieldIssue } from '../schema/schema-check.types';
import type { ActionField } from '../screen/action-input.types';
import type { ViewAvailability } from '../screen/availability.types';
import type { Choice } from '../screen/screen-code.types';
import type { ViewContext } from './context.types';

/**
 * Отказ: код ошибки, главная строка `ErrorText` и признак «у экрана свой
 * ответ» (код из `catches`).
 */
export type Refusal = {
  readonly code: string;
  readonly text: string;
  readonly caught: boolean;
};

/** Почему действие недоступно. */
export type UnavailableReason = 'unknown' | 'disabled' | 'readOnly' | 'closed';

/** Исход действия экрана; что показать и куда перейти, решает канал. */
export type ActionOutcome =
  | { readonly kind: 'moved'; readonly address: AddressJson }
  | { readonly kind: 'stayed'; readonly revision: number }
  | { readonly kind: 'exited'; readonly exit: string; readonly data?: unknown }
  | { readonly kind: 'rejected'; readonly issues: readonly FieldIssue[] }
  | { readonly kind: 'refused'; readonly refusal: Refusal }
  | { readonly kind: 'stale'; readonly revision: number }
  | { readonly kind: 'unavailable'; readonly reason: UnavailableReason }
  | {
      readonly kind: 'confirm';
      readonly label: string;
      readonly description: string;
    };

/** Исход локального действия; `refused` — дефект кода, экземпляр прежний. */
export type LocalOutcome =
  | { readonly kind: 'changed' }
  | { readonly kind: 'rejected'; readonly issues: readonly FieldIssue[] }
  | { readonly kind: 'refused'; readonly refusal: Refusal }
  | { readonly kind: 'unavailable'; readonly reason: UnavailableReason };

/**
 * Действие в виде экземпляра: доступность (доступно или отключено с
 * причиной; скрытого в виде нет), подсказка, поля входа, подтверждение.
 * `rows` — только у действия строки: строки текущих данных в порядке
 * списка, значение — ключ строки; канал без строк собирает тот же вход
 * полем `choice` из `fields`.
 */
export type ActionView = {
  readonly name: string;
  readonly hint?: string;
  readonly availability: ViewAvailability;
  readonly fields: readonly ActionField[];
  readonly confirm?: ItemTexts;
  readonly rows?: readonly Choice[];
};

/** Локальное действие в виде экземпляра; скрытого в виде нет. */
export type LocalView = {
  readonly name: string;
  readonly hint?: string;
  readonly availability: ViewAvailability;
  readonly fields: readonly ActionField[];
};

/**
 * Вид экземпляра для представления канала. У `refused` нет данных и
 * действий, есть `refusal`.
 */
export type InstanceView = {
  readonly screen: string;
  readonly address: AddressJson;
  readonly revision: number;
  readonly status: 'ready' | 'refused';
  readonly hint?: string;
  readonly data?: unknown;
  readonly state?: unknown;
  readonly refusal?: Refusal;
  readonly context: ViewContext;
  readonly primary?: string;
  readonly actions: readonly ActionView[];
  readonly locals: readonly LocalView[];
};

/**
 * Вид экземпляра в типах экрана — для представления канала. Только тип:
 * соответствие `data` и `state` схемам экрана гарантирует ядро, приведение
 * делает канал один раз.
 */
export type ScreenViewOf<D extends AnyScreenDef> = Omit<
  InstanceView,
  'data' | 'state'
> & {
  readonly data?: DataOf<D>;
  readonly state?: StateOf<D>;
};

/**
 * Почему изменился вид экземпляра: перечитывание по сигналу, действие с
 * исходом `stayed` или локальное действие; `revision` — ревизия после.
 */
export type ViewChange = {
  readonly cause: 'refreshed' | 'acted' | 'local';
  readonly revision: number;
};

/** Снимок экземпляра для хранения каналом; восстанавливает `restore`. */
export type InstanceJson = {
  readonly address: AddressJson;
  readonly state: unknown;
  readonly revision: number;
};
