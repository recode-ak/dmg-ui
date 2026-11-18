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
 * `expected` — данные вида — ожидаемый итог действия, ответа ещё нет (D-UI-84).
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
  readonly expected?: true;
};

/**
 * Ожидаемый итог действия: данные вида, какими их покажет ответ; проверяется
 * схемой данных экрана (D-UI-84). Получает вид с итогами прежних наложений —
 * живые данные экземпляра, менять их нельзя. Зовётся на каждый пересчёт
 * области (перечитывание, заметка, локальное действие) — должна быть чистой.
 */
export type PageExpected = (view: InstanceView) => unknown;
