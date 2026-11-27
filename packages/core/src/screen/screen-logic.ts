import { err, ok, type Result } from 'dmg-core';
import * as v from 'valibot';
import type {
  AnyScreenDef,
  DataOf,
  StateOf,
} from '../manifest/screen-def.types';
import { ActionInput } from './action-input';
import type { ActionField, InputRejection } from './action-input.types';
import { ActionRows } from './action-rows';
import type { Availability } from './availability';
import { CodeDefect } from './code-defect';
import type { ScreenCode } from './screen-code';
import type { AvailabilityContext, Choice, InputOf } from './screen-code.types';
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
  private readonly actionRows: ReadonlyMap<string, ActionRows>;
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
    const rows = new Map<string, ActionRows>();
    for (const action of Object.values(def.actions)) {
      if (action.row === undefined) continue;
      const where = `Экран ${def.name}, действие ${action.name}`;
      rows.set(action.name, new ActionRows(action.row, where));
    }
    this.actionRows = rows;
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
   * Строки действия строки по текущим данным; у действия без `row` —
   * `undefined`. Неизвестное имя — бросок.
   */
  rows(name: ActionName<D>, data: DataOf<D>): readonly Choice[] | undefined {
    this.actionInput(name);
    return this.actionRows.get(name)?.of(data);
  }

  /**
   * Поля входа действия или локального действия: описание поля — из схемы,
   * варианты и начальные значения — из кода; поле с вариантами кода — вида
   * `choice`. У действия строки варианты поля — его строки, `choices` кода
   * не спрашивается. Начальное значение не по схеме поля — бросок.
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
    const rows = this.actionRows.get(name)?.of(data);
    const choices =
      rows === undefined
        ? (this.code.choices?.(name, data, state) ?? {})
        : Object.fromEntries(input.fields().map((field) => [field.name, rows]));
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
        ...(variants === undefined
          ? {}
          : { kind: 'choice' as const, choices: variants }),
        ...(field.name in defaults.value
          ? { initial: defaults.value[field.name] }
          : {}),
      };
    });
  }

  /**
   * Сырой вход действия по его схеме; действие без входа — `undefined`. У
   * действия строки значение поля входа ещё и должно быть ключом строки
   * текущих данных, иначе — отказ «Строки нет в списке».
   */
  checkInput<K extends ActionName<D>>(
    name: K,
    raw: unknown,
    data: DataOf<D>,
  ): Result<InputOf<D['actions'][K]['input']>, InputRejection> {
    const checked = this.inputOf(this.actionInput(name), raw);
    const rows = this.actionRows.get(name);
    if (checked.ok && rows !== undefined) {
      const listed = this.listed(rows, checked.value, data);
      if (!listed.ok) return listed;
    }
    // Проверка шла по схеме `input` действия `name`, её выход — ровно
    // `InputOf` этой схемы; по имени-строке TS этой связи не выводит.
    return checked as Result<InputOf<D['actions'][K]['input']>, InputRejection>;
  }

  /** Поле входа действия строки — ключ строки текущих данных. */
  private listed(
    rows: ActionRows,
    input: unknown,
    data: DataOf<D>,
  ): Result<undefined, InputRejection> {
    const values =
      typeof input === 'object' && input !== null ? Object.entries(input) : [];
    for (const [field, value] of values) {
      if (!rows.has(data, value)) {
        return err({
          issues: [{ field, text: ActionRows.NOT_LISTED_TEXT }],
        });
      }
    }
    return ok(undefined);
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
