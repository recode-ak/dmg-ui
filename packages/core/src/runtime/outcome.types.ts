import type { AddressJson } from '../address/address-codec.types';
import type { ItemTexts } from '../manifest/screen-def.types';
import type { FieldIssue } from '../schema/schema-check.types';
import type { ActionField } from '../screen/action-input.types';
import type { RenderContext } from './context.types';

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

/** Действие в виде экземпляра: доступность, поля входа, подтверждение. */
export type ActionView = {
  readonly name: string;
  readonly available: boolean;
  readonly fields: readonly ActionField[];
  readonly confirm?: ItemTexts;
};

/** Локальное действие в виде экземпляра. */
export type LocalView = {
  readonly name: string;
  readonly available: boolean;
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
  readonly data?: unknown;
  readonly state?: unknown;
  readonly refusal?: Refusal;
  readonly context: RenderContext;
  readonly primary?: string;
  readonly actions: readonly ActionView[];
  readonly locals: readonly LocalView[];
};

/** Снимок экземпляра для хранения каналом; восстанавливает `restore`. */
export type InstanceJson = {
  readonly address: AddressJson;
  readonly state: unknown;
  readonly revision: number;
};
