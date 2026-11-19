import { err, ok, type Result } from 'dmg-core';
import * as v from 'valibot';
import type {
  AnyScreenDef,
  DataOf,
  StateOf,
} from '../manifest/screen-def.types';
import { ActionInput } from './action-input';
import type { ActionField, InputRejection } from './action-input.types';
import type { Availability } from './availability';
import { CodeDefect } from './code-defect';
import type { ScreenCode } from './screen-code';
import type { AvailabilityContext, InputOf } from './screen-code.types';
import type {
  ActionName,
  CheckedLocalFn,
  LocalName,
} from './screen-logic.types';

export type { ActionName, LocalName } from './screen-logic.types';

/**
 * Чистая логика экрана из манифеста и кода: состояние, локальные действия,
 * доступность, поля и проверка входа действия. Без портов и исполнителя —
 * её зовут исполнитель и тесты. Отказ на внешний вход — `Result`,
 * ошибка кода экрана (состояние или начальные значения не по схеме) —
 * бросок `CodeDefect` с путями полей, без значений.
 */
export class ScreenLogic<D extends AnyScreenDef, S = unknown> {
  readonly def: D;
  readonly code: ScreenCode<D, S>;
  private readonly actionInputs: ReadonlyMap<string, ActionInput | undefined>;
  private readonly localInputs: ReadonlyMap<string, ActionInput | undefined>;
  private readonly localFns: ReadonlyMap<string, CheckedLocalFn<D>>;

  /**
   * Код сверяется с манифестом сразу: у экрана со `state` нет
   * `initialState` или у локального действия нет функции — бросок.
   */
  constructor(def: D, code: ScreenCode<D, S>) {
    this.def = def;
    this.code = code;
    this.actionInputs = ScreenLogic.inputsOf(def.actions);
    this.localInputs = ScreenLogic.inputsOf(def.locals);
    if (def.state !== undefined && code.initialState === undefined) {
      throw new CodeDefect(
        `Экран ${def.name}: у экрана есть состояние, а код экрана не задал initialState`,
      );
    }
    // Вход функции проверяет схема этого же локального действия, то есть
    // он имеет тип её параметра; по имени-строке TS этой связи не выводит.
    const fns = code.locals as Readonly<
      Record<string, CheckedLocalFn<D> | undefined>
    >;
    const localFns = new Map<string, CheckedLocalFn<D>>();
    for (const name of this.localInputs.keys()) {
      const fn = fns[name];
      if (fn === undefined) {
        throw new CodeDefect(
          `Экран ${def.name}: код экрана не задал локальное действие ${name}`,
        );
      }
      localFns.set(name, fn);
    }
    this.localFns = localFns;
  }

  /**
   * Состояние экземпляра из сохранённого значения: по схеме — оно же,
   * иначе (нет, лишний ключ, не тот тип) — `initialState(data)` кода.
   * У экрана без состояния — `undefined`.
   */
  restoreState(raw: unknown, data: DataOf<D>): StateOf<D> {
    const restored = this.parseState(raw);
    if (restored.ok) return restored.value;
    // Без схемы состояния `parseState` всегда успешен, а со схемой наличие
    // `initialState` проверил конструктор.
    const initial = this.code.initialState?.(data);
    return this.stateOrThrow(initial, 'initialState');
  }

  /**
   * Локальное действие: вход по схеме, затем функция кода. Вход не по схеме —
   * отказ, функция не вызвана; функция вернула состояние не по схеме — бросок.
   */
  applyLocal(
    name: LocalName<D>,
    rawInput: unknown,
    state: StateOf<D>,
    data: DataOf<D>,
  ): Result<StateOf<D>, InputRejection> {
    const fn = this.localFns.get(name);
    if (fn === undefined) {
      throw new CodeDefect(
        `Экран ${this.def.name}: нет локального действия ${name}`,
      );
    }
    const input = this.inputOf(this.localInputs.get(name), rawInput);
    if (!input.ok) return input;
    return ok(this.stateOrThrow(fn(state, data, input.value), name));
  }

  /**
   * Ответ о действии или локальном действии по карте `availability` кода;
   * нет записи — доступно. Неизвестное имя — бросок.
   */
  availability(
    name: ActionName<D> | LocalName<D>,
    ctx: AvailabilityContext<D, S>,
  ): Availability {
    if (!this.actionInputs.has(name) && !this.localInputs.has(name)) {
      throw new CodeDefect(`Экран ${this.def.name}: нет действия ${name}`);
    }
    const fn = this.code.availability[name];
    return fn === undefined ? { kind: 'available' } : fn(ctx);
  }

  /**
   * Поля входа действия или локального действия: подпись и признак из
   * схемы, варианты и начальные значения — из кода. Начальное значение не
   * по схеме поля — бросок.
   */
  fields(
    name: ActionName<D> | LocalName<D>,
    data: DataOf<D>,
    state: StateOf<D>,
  ): readonly ActionField[] {
    const input = this.localInputs.has(name)
      ? this.localInputs.get(name)
      : this.actionInput(name);
    if (input === undefined) return [];
    const choices = this.code.choices?.(name, data, state) ?? {};
    const defaults = input.checkFields(
      this.code.defaults?.(name, data, state) ?? {},
    );
    if (!defaults.ok) {
      const fields = defaults.error.issues.map((issue) => issue.field ?? '—');
      throw new CodeDefect(
        `Экран ${this.def.name}, действие ${name}: defaults не по схеме (поля: ${fields.join(', ')})`,
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
  checkInput<K extends ActionName<D>>(
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
      throw new CodeDefect(`Экран ${this.def.name}: нет действия ${name}`);
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
      : err(
          parsed.issues.map((issue) => v.getDotPath(issue) ?? '—').join(', '),
        );
  }

  /** Состояние из кода экрана; не по схеме — бросок с источником. */
  private stateOrThrow(value: unknown, source: string): StateOf<D> {
    const parsed = this.parseState(value);
    if (parsed.ok) return parsed.value;
    throw new CodeDefect(
      `Экран ${this.def.name}: ${source} вернул состояние не по схеме (поля: ${parsed.error})`,
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
