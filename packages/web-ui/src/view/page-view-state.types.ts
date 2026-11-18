import type { AddressJson, FieldIssue, InstanceView } from 'dmg-ui';
import type { PageFormValues } from './page-form.types';

/** Статус области: пуста, грузится, вид готов, вид отказа. */
export type PageViewStatus = 'empty' | 'loading' | 'ready' | 'refused';

/** Почему вид помечен устаревшим: исход `stale` или нет соединения. */
export type PageStaleReason = 'revision' | 'offline';

/** Ожидающее подтверждение области — то, что видит пользователь. */
export type PageConfirm = {
  readonly action: string;
  readonly label: string;
  readonly description: string;
};

/**
 * Введённое в отвергнутую форму: какая форма и её значения. Живёт до
 * следующего действия области; в снимок вкладки не входит.
 */
export type PageEntered = {
  readonly kind: 'action' | 'local';
  readonly name: string;
  readonly values: PageFormValues;
};

/**
 * Состояние области — только данные JSON (D-UI-70). `address` нет только у
 * `empty`; `view` есть ровно у `ready` и `refused`, и `view.status` равен
 * `status`. `refreshing` — идёт перечитывание по сигналу, вид прежний.
 */
export type PageViewState = {
  readonly status: PageViewStatus;
  readonly address?: AddressJson;
  readonly view?: InstanceView;
  readonly refreshing: boolean;
  readonly stale?: PageStaleReason;
  readonly note?: string;
  readonly issues: readonly FieldIssue[];
  readonly confirm?: PageConfirm;
  readonly entered?: PageEntered;
};
