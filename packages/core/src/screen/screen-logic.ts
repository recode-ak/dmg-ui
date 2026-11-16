import { err, ok, type Result } from 'dmg-core';
import * as v from 'valibot';
import type {
  AnyScreenDef,
  DataOf,
  StateOf,
} from '../manifest/screen-def.types';
import { ActionInput } from './action-input';
import type { ActionField, InputRejection } from './action-input.types';
import type { ScreenCode } from './screen-code';
import type { InputOf } from './screen-code.types';

/** Функция локального действия со входом, уже проверенным схемой. */
type CheckedLocalFn<D extends AnyScreenDef> = (
  state: StateOf<D>,
  data: DataOf<D>,
  input: unknown,
) => unknown;

/**
 * Чистая логика экрана из манифеста и кода: состояние, локальные действия,
 * доступность, поля и проверка входа действия. Без портов и исполнителя —
 * её зовут исполнитель (Ф4) и тесты. Отказ на внешний вход — `Result`,
 * ошибка кода экрана (состояние или начальные значения не по схеме) —
 * бросок.
 */
export class ScreenLogic<D extends AnyScreenDef> {
  readonly def: D;
  readonly code: ScreenCode<D>;
  private readonly actionInputs: ReadonlyMap<string, ActionInput | undefined>;
  private readonly localInputs: ReadonlyMap<string, ActionInput | undefined>;

  constructor(def: D, code: ScreenCode<D>) {
    this.def = def;
    this.code = code;
    this.actionInputs = ScreenLogic.inputsOf(def.actions);
    this.localInputs = ScreenLogic.inputsOf(def.locals);
  }

  /**
   * Состояние экземпляра из сохранённого значения: по схеме — оно же,
   * иначе (нет, лишний ключ, не тот тип) — `initialState(data)` кода.
   * У экрана без состояния — `undefined`.
   */
  restoreState(raw: unknown, data: DataOf<D>): StateOf<D> {
    const restored = this.parseState(raw);
    if (restored.ok) return restored.value;
    const initial = this.code.initialState;
    if (initial === undefined) {
      throw new Error(
        `Экран ${this.def.name}: у экрана есть состояние, а код экрана не задал initialState`,
      );
    }
    return this.stateOrThrow(initial.call(this.code, data), 'initialState');
  }

  /**
   * Локальное действие: вход по схеме, затем функция кода. Вход не по схеме —
   * отказ, функция не вызвана; функция вернула состояние не по схеме — бросок.
   */
  applyLocal(
    name: string,
    rawInput: unknown,
    state: StateOf<D>,
    data: DataOf<D>,
  ): Result<StateOf<D>, InputRejection> {
    if (!this.localInputs.has(name)) {
      throw new Error(
        `Экран ${this.def.name}: нет локального действия ${name}`,
      );
    }
    // Вход функции проверен схемой этого же локального действия, то есть
    // имеет тип её параметра; по имени-строке TS этой связи не выводит.
    const fns = this.code.locals as Readonly<
      Record<string, CheckedLocalFn<D> | undefined>
    >;
    const fn = fns[name];
    if (fn === undefined) {
      throw new Error(
        `Экран ${this.def.name}: код экрана не задал локальное действие ${name}`,
      );
    }
    const input = this.inputOf(this.localInputs.get(name), rawInput);
    if (!input.ok) return input;
    return ok(this.stateOrThrow(fn(state, data, input.value), name));
  }

  /** Доступно ли действие или локальное действие; без метода кода — да. */
  available(name: string, data: DataOf<D>, state: StateOf<D>): boolean {
    return this.code.available?.(name, data, state) ?? true;
  }

  /**
   * Поля входа действия: подпись и признак из схемы, варианты и начальные
   * значения — из кода. Начальное значение не по схеме поля — бросок.
   */
  fields(
    name: string,
    data: DataOf<D>,
    state: StateOf<D>,
  ): readonly ActionField[] {
    const input = this.actionInput(name);
    if (input === undefined) return [];
    const choices = this.code.choices?.(name, data, state) ?? {};
    const defaults = input.checkFields(
      this.code.defaults?.(name, data, state) ?? {},
    );
    if (!defaults.ok) {
      const text = defaults.error.issues
        .map((issue) => `${issue.field}: ${issue.text}`)
        .join('; ');
      throw new Error(
        `Экран ${this.def.name}, действие ${name}: defaults не по схеме — ${text}`,
      );
    }
    return input.fields().map((field) => {
      const variants = choices[field.name];
      return {
        ...field,
        ...(variants === undefined ? {} : { choices: variants }),
        ...(field.name in defaults.value
          ? { initial: defaults.value[field.name] }
          : {}),
      };
    });
  }

  /** Сырой вход действия по его схеме; действие без входа — `undefined`. */
  checkInput<K extends keyof D['actions'] & string>(
    name: K,
    raw: unknown,
  ): Result<InputOf<D['actions'][K]['input']>, InputRejection> {
    // Проверка шла по схеме `input` действия `name`, её выход — ровно
    // `InputOf` этой схемы; по имени-строке TS этой связи не выводит.
    return this.inputOf(this.actionInput(name), raw) as Result<
      InputOf<D['actions'][K]['input']>,
      InputRejection
    >;
  }

  /** Вход действия по имени; неизвестное имя — ошибка программиста. */
  private actionInput(name: string): ActionInput | undefined {
    if (!this.actionInputs.has(name)) {
      throw new Error(`Экран ${this.def.name}: нет действия ${name}`);
    }
    return this.actionInputs.get(name);
  }

  private inputOf(
    input: ActionInput | undefined,
    raw: unknown,
  ): Result<unknown, InputRejection> {
    return input === undefined ? ok(undefined) : input.check(raw);
  }

  /**
   * Значение по схеме состояния. Без схемы состояния — `undefined`, как
   * `StateOf<D>`; TS не сужает условный `StateOf` по проверке значения,
   * поэтому выход приводится к нему здесь, в одном месте.
   */
  private parseState(raw: unknown): Result<StateOf<D>, string> {
    const schema = this.def.state;
    if (schema === undefined) return ok(undefined as StateOf<D>);
    const parsed = v.safeParse(schema, raw);
    return parsed.success
      ? ok(parsed.output as StateOf<D>)
      : err(v.summarize(parsed.issues));
  }

  /** Состояние из кода экрана; не по схеме — бросок с источником. */
  private stateOrThrow(value: unknown, source: string): StateOf<D> {
    const parsed = this.parseState(value);
    if (parsed.ok) return parsed.value;
    throw new Error(
      `Экран ${this.def.name}: ${source} вернул состояние не по схеме — ${parsed.error}`,
    );
  }

  private static inputsOf(
    items: Readonly<
      Record<string, { readonly input: ActionInput['schema'] | undefined }>
    >,
  ): ReadonlyMap<string, ActionInput | undefined> {
    return new Map(
      Object.entries(items).map(([name, item]) => [
        name,
        item.input === undefined ? undefined : new ActionInput(item.input),
      ]),
    );
  }
}
