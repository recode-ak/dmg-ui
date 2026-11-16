import type {
  AnyUseCaseDef,
  DomainError,
  OutputOf,
  Result,
  InputOf as UcInputOf,
  UseCaseErrorOf,
} from 'dmg-core';
import type * as v from 'valibot';
import type {
  AnyScreenDef,
  DataOf,
  ParamsOf,
  StateOf,
} from '../manifest/screen-def.types';
import type { ActionContext } from '../runtime/context.types';
import type { Transition } from './transition.types';

/** Вариант значения поля входа: значение и его подпись. */
export type Choice = {
  readonly value: string | number | boolean;
  readonly label: string;
};

/** Варианты полей входа по именам полей; поле без вариантов не указано. */
export type FieldChoices = Readonly<Partial<Record<string, readonly Choice[]>>>;

/** Начальные значения полей входа по именам полей. */
export type FieldValues = Readonly<Record<string, unknown>>;

/** Тип входа по схеме входа; действие без входа — `undefined`. */
export type InputOf<I> = I extends v.GenericSchema
  ? v.InferOutput<I>
  : undefined;

/**
 * Функция локального действия: новое состояние из текущего, данных и
 * проверенного входа. UC не вызывает, перехода не возвращает.
 */
export type LocalFn<D extends AnyScreenDef, I> = (
  state: StateOf<D>,
  data: DataOf<D>,
  input: I,
) => StateOf<D>;

/** Функции локальных действий по именам `locals` манифеста экрана. */
export type LocalFns<D extends AnyScreenDef> = {
  readonly [K in keyof D['locals']]: LocalFn<
    D,
    InputOf<D['locals'][K]['input']>
  >;
};

/**
 * Чтение для загрузки: только query UC из `reads` узла (экрана или
 * уведомления). Необъявленный UC не компилируется, а в рантайме — дефект.
 */
export type ReadPort<D extends { readonly reads: readonly AnyUseCaseDef[] }> = <
  U extends D['reads'][number],
>(
  uc: U,
  input: UcInputOf<U>,
) => Promise<Result<OutputOf<U>, UseCaseErrorOf<U>>>;

/** Вход загрузки экрана: параметры адреса, чтение и контекст. */
export type LoadContext<D extends AnyScreenDef> = {
  readonly params: ParamsOf<D>;
  readonly read: ReadPort<D>;
  readonly context: ActionContext;
};

/** Вход шага действия: параметры, данные, состояние, вход действия, контекст. */
export type StepContext<D extends AnyScreenDef, I> = {
  readonly params: ParamsOf<D>;
  readonly data: DataOf<D>;
  readonly state: StateOf<D>;
  readonly input: I;
  readonly context: ActionContext;
};

/** Вход UC действия; у действия без `uc` — `undefined`. */
export type UcInputFor<U> = U extends AnyUseCaseDef ? UcInputOf<U> : undefined;

/** Выход UC действия; у действия без `uc` — `undefined`. */
export type UcOutputFor<U> = U extends AnyUseCaseDef ? OutputOf<U> : undefined;

/**
 * Шаги действия: `command` строит вход UC (без него — вход действия),
 * `done` даёт переход по выходу UC, `caught` — по отказу с кодом из
 * `catches` экрана. Порт UC шагам не виден: вызывает исполнитель.
 */
export type ActionStep<D extends AnyScreenDef, I, U> = {
  command?(ctx: StepContext<D, I>): UcInputFor<U>;
  done(ctx: StepContext<D, I>, output: UcOutputFor<U>): Transition;
  caught?(ctx: StepContext<D, I>, error: DomainError): Transition;
};

/** Шаги действий по именам `actions` манифеста экрана. */
export type ActionSteps<D extends AnyScreenDef> = {
  readonly [K in keyof D['actions']]: ActionStep<
    D,
    InputOf<D['actions'][K]['input']>,
    D['actions'][K]['uc']
  >;
};
