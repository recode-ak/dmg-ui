import type { TraceJson } from 'dmg-core';
import type { ActionOutcome } from './outcome.types';

/**
 * Запись наблюдателя UI: узел графа, след и экземпляр. Входа, данных,
 * payload и текстов замечаний в записи нет.
 */
export type UiRecord = {
  readonly node: string;
  readonly trace: TraceJson;
  readonly instance?: string;
} & (
  | { readonly kind: 'opened' | 'refreshed'; readonly revision: number }
  | { readonly kind: 'acted'; readonly revision: number }
  | {
      readonly kind: 'outcome';
      readonly outcome: ActionOutcome['kind'];
      readonly to?: string;
      readonly exit?: string;
      readonly fields?: readonly string[];
    }
  | {
      readonly kind: 'refused';
      readonly code: string;
      readonly caught: boolean;
    }
  | {
      readonly kind: 'notified';
      readonly recipient: string;
      readonly eventId: string;
    }
  | { readonly kind: 'defect'; readonly text: string }
);

/**
 * Сырой бросок кода экрана или слушателя `onChange` — для диагностики
 * разработчика. Может содержать данные: не для лога UI.
 */
export type UiFault = {
  readonly node: string;
  readonly trace: TraceJson;
  readonly error: unknown;
};

/** Наблюдатель UI: синхронный и не бросает, как `logger`. */
export type UiObserver = {
  record(entry: UiRecord): void;
};
