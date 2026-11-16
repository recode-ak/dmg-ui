import type * as v from 'valibot';
import type {
  AnyScreenDef,
  DataOf,
  StateOf,
} from '../manifest/screen-def.types';

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
 * проверенного входа. UC не вызывает, перехода не возвращает (Т-6).
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
