import type { DomainError } from 'dmg-core';
import type { Transition } from '../screen/transition.types';
import type { ActionContext } from './context.types';
import type { ActionView, LocalView, Refusal } from './outcome.types';
import type { ScreenUnit } from './screen-unit';

/**
 * Значения экземпляра без типа экрана: `params` — по схеме адреса, `data` и
 * `state` — по схемам экрана (проверяет `ScreenUnit`).
 */
export type ScreenFrame = {
  readonly params: unknown;
  readonly data: unknown;
  readonly state: unknown;
};

/** Вход шага действия без типа экрана. */
export type ErasedStepContext = ScreenFrame & {
  readonly input: unknown;
  readonly context: ActionContext;
};

/** Шаги действия без типа экрана — так их зовёт исполнитель. */
export type ErasedStep = {
  command?(ctx: ErasedStepContext): unknown;
  done(ctx: ErasedStepContext, output: unknown): Transition;
  caught?(ctx: ErasedStepContext, error: DomainError): Transition;
};

/** Итог загрузки: данные и состояние, отказ UC или дефект кода с причиной (бросок). */
export type UnitLoad =
  | { readonly kind: 'ready'; readonly data: unknown; readonly state: unknown }
  | { readonly kind: 'refused'; readonly refusal: Refusal }
  | { readonly kind: 'defect'; readonly cause: unknown };

/** Действия и локальные действия для вида экземпляра. */
export type UnitPresentation = {
  readonly actions: readonly ActionView[];
  readonly locals: readonly LocalView[];
};

/** Любой юнит экрана — публичные члены `ScreenUnit` без типа экрана. */
export type AnyScreenUnit = {
  readonly [K in keyof ScreenUnit]: ScreenUnit[K];
};
