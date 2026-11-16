import type { DomainError, Result, TraceJson } from 'dmg-core';
import type { ScreenAction } from '../manifest/screen-action';
import type {
  AnyScreenDef,
  DataOf,
  ParamsOf,
  StateOf,
} from '../manifest/screen-def.types';
import { SchemaCheck } from '../schema/schema-check';
import type { ActionContext } from '../screen/action-context.types';
import type { InputRejection } from '../screen/action-input.types';
import { CodeDefect } from '../screen/code-defect';
import type { ScreenCode } from '../screen/screen-code';
import type { LoadContext } from '../screen/screen-code.types';
import { ScreenLogic } from '../screen/screen-logic';
import type { ActionName, LocalName } from '../screen/screen-logic.types';
import { DeclaredReads } from './declared-reads';
import type { UcPort } from './ports.types';
import { RefusalText } from './refusal-text';
import type {
  ErasedStep,
  ScreenFrame,
  UnitLoad,
  UnitPresentation,
} from './screen-unit.types';

export type {
  AnyScreenUnit,
  ErasedStep,
  ErasedStepContext,
  ScreenFrame,
  UnitLoad,
  UnitPresentation,
} from './screen-unit.types';

/**
 * Экран для исполнителя: Def, код и `ScreenLogic` под API без типа экрана.
 * Код сверяется с манифестом в конструкторе: нет `load` или `done` у
 * действия — бросок с именем. Бросок кода при загрузке — дефект в итоге.
 */
export class ScreenUnit<D extends AnyScreenDef = AnyScreenDef> {
  readonly def: AnyScreenDef;
  readonly refusals: RefusalText;
  private readonly logic: ScreenLogic<D>;
  private readonly steps: ReadonlyMap<string, ErasedStep>;
  private readonly loader: (
    ctx: LoadContext<D>,
  ) => Promise<Result<DataOf<D>, DomainError>>;

  constructor(def: D, code: ScreenCode<D>) {
    this.def = def;
    this.refusals = new RefusalText(def.catches);
    this.logic = new ScreenLogic(def, code);
    const load = code.load;
    if (load === undefined) {
      throw new CodeDefect(`Экран ${def.name}: код экрана не задал load`);
    }
    this.loader = (ctx) => load.call(code, ctx);
    // Шаги зовёт только экземпляр этого юнита с `ErasedStepContext`,
    // собранным по схемам экрана и действия; по имени-строке TS этой связи
    // не выводит.
    const all = code.actions as Readonly<
      Record<string, ErasedStep | undefined>
    >;
    const steps = new Map<string, ErasedStep>();
    for (const name of Object.keys(def.actions)) {
      const step = all[name];
      if (step?.done === undefined) {
        throw new CodeDefect(
          `Экран ${def.name}: код экрана не задал done у действия ${name}`,
        );
      }
      steps.set(name, step);
    }
    this.steps = steps;
  }

  /** Действие манифеста по имени; не из манифеста — `undefined`. */
  action(name: string): ScreenAction | undefined {
    return Object.hasOwn(this.def.actions, name)
      ? this.def.actions[name]
      : undefined;
  }

  /** Есть ли локальное действие с таким именем. */
  hasLocal(name: string): boolean {
    return Object.hasOwn(this.def.locals, name);
  }

  /** Шаги действия манифеста; наличие проверил конструктор. */
  step(name: string): ErasedStep {
    const step = this.steps.get(name);
    if (step === undefined) {
      throw new CodeDefect(`Экран ${this.def.name}: нет действия ${name}`);
    }
    return step;
  }

  /**
   * Загрузка через объявленные `reads`, данные — по схеме, состояние —
   * `prevState` по схеме или начальное. Не бросает.
   */
  async load(
    params: unknown,
    io: {
      readonly node: string;
      readonly ucs: UcPort;
      readonly trace: TraceJson;
    },
    context: ActionContext,
    prevState: unknown,
  ): Promise<UnitLoad> {
    const reads = new DeclaredReads({
      owner: `Экран ${this.def.name}`,
      reads: this.def.reads,
      ...io,
    });
    try {
      const loaded = await this.loader({
        params: this.typedParams(params),
        read: reads.read,
        context,
      });
      if (!loaded.ok) {
        return { kind: 'refused', refusal: this.refusals.of(loaded.error) };
      }
      const data = new SchemaCheck(this.logic.def.data).run(loaded.value);
      if (!data.ok) {
        const fields = data.error.map((issue) => issue.field ?? '—');
        return this.defect(
          `данные загрузки не по схеме (поля: ${fields.join(', ')})`,
        );
      }
      const state = this.logic.restoreState(prevState, data.value);
      return { kind: 'ready', data: data.value, state };
    } catch (error) {
      return { kind: 'defect', cause: error };
    }
  }

  /** Действия и локальные действия для вида; `readOnly` гасит действия с `uc`. */
  present(frame: ScreenFrame, readOnly: boolean): UnitPresentation {
    const { data, state } = this.typed(frame);
    return {
      actions: Object.values<ScreenAction>(this.def.actions).map((action) => {
        const name = this.actionName(action.name);
        return {
          name: action.name,
          available:
            !(readOnly && action.uc !== undefined) &&
            this.logic.available(name, data, state),
          fields: this.logic.fields(name, data, state),
          ...(action.confirm === undefined ? {} : { confirm: action.confirm }),
        };
      }),
      locals: Object.keys(this.def.locals).map((local) => {
        const name = this.localName(local);
        return {
          name: local,
          available: this.logic.available(name, data, state),
          fields: this.logic.fields(name, data, state),
        };
      }),
    };
  }

  /** Доступно ли действие или локальное действие манифеста сейчас. */
  available(name: string, frame: ScreenFrame): boolean {
    const { data, state } = this.typed(frame);
    const known = this.hasLocal(name)
      ? this.localName(name)
      : this.actionName(name);
    return this.logic.available(known, data, state);
  }

  /** Сырой вход действия манифеста по его схеме. */
  checkInput(name: string, raw: unknown): Result<unknown, InputRejection> {
    return this.logic.checkInput(this.actionName(name), raw);
  }

  /** Локальное действие: новое состояние или отказ на вход. */
  applyLocal(
    name: string,
    raw: unknown,
    frame: ScreenFrame,
  ): Result<unknown, InputRejection> {
    const { data, state } = this.typed(frame);
    return this.logic.applyLocal(this.localName(name), raw, state, data);
  }

  /** Текст дефекта с именем экрана. */
  private defect(text: string): UnitLoad {
    return {
      kind: 'defect',
      cause: new CodeDefect(`Экран ${this.def.name}: ${text}`),
    };
  }

  /**
   * Значения экземпляра в типах экрана. Кадр собирает экземпляр этого
   * юнита: параметры — из адреса по схеме `params`, данные и состояние —
   * из `load` выше (схемы `data`, `state`).
   */
  private typed(frame: ScreenFrame): {
    readonly data: DataOf<D>;
    readonly state: StateOf<D>;
  } {
    return frame as { readonly data: DataOf<D>; readonly state: StateOf<D> };
  }

  /** Параметры адреса этого экрана — выход его схемы `params` (см. `typed`). */
  private typedParams(params: unknown): ParamsOf<D> {
    return params as ParamsOf<D>;
  }

  /** Имя из манифеста; проверено здесь, TS не сужает строку до ключа. */
  private actionName(name: string): ActionName<D> {
    if (this.action(name) === undefined) {
      throw new CodeDefect(`Экран ${this.def.name}: нет действия ${name}`);
    }
    return name as ActionName<D>;
  }

  /** То же для локального действия. */
  private localName(name: string): LocalName<D> {
    if (!this.hasLocal(name)) {
      throw new CodeDefect(
        `Экран ${this.def.name}: нет локального действия ${name}`,
      );
    }
    return name as LocalName<D>;
  }
}
