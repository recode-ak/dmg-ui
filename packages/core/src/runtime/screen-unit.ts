import type { DomainError, Result, TraceJson } from 'dmg-core';
import type { ScreenAction } from '../manifest/screen-action';
import type {
  AnyScreenDef,
  DataOf,
  ParamsOf,
  StateOf,
} from '../manifest/screen-def.types';
import type { ScreenLocal } from '../manifest/screen-local';
import { SchemaCheck } from '../schema/schema-check';
import type { ActionContext } from '../screen/action-context.types';
import type { InputRejection } from '../screen/action-input.types';
import type { Availability } from '../screen/availability';
import { CodeDefect } from '../screen/code-defect';
import type { ScreenCode } from '../screen/screen-code';
import type {
  AvailabilityContext,
  LoadContext,
} from '../screen/screen-code.types';
import { ScreenLogic } from '../screen/screen-logic';
import type { ActionName, LocalName } from '../screen/screen-logic.types';
import type { RenderContext } from './context.types';
import { DeclaredReads } from './declared-reads';
import { ExampleCheck } from './example-check';
import type { ActionView, LocalView } from './outcome.types';
import type { UcPort } from './ports.types';
import { RefusalText } from './refusal-text';
import type {
  ErasedStep,
  ScreenFrame,
  UnitLoad,
  UnitPresentation,
} from './screen-unit.types';
import type { UcCalls } from './uc-calls';

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
  /** Причина отключения действий с `uc` при «только чтении» (D-UI-11). */
  static readonly READ_ONLY_TEXT = 'Только чтение: изменения недоступны';

  readonly def: AnyScreenDef;
  readonly refusals: RefusalText;
  private readonly logic: ScreenLogic<D>;
  private readonly steps: ReadonlyMap<string, ErasedStep>;
  private readonly loader: (
    ctx: LoadContext<D>,
  ) => Promise<Result<DataOf<D>, DomainError>>;

  /**
   * `anySubject` — код с субъектом любого типа проекта (`never` — верхний тип по
   * субъекту). Ядро субъекта не разбирает: он приходит из контекста рендера
   * (`RenderContext.subject`) — тот же объект, что получает Policy, — и тип
   * субъекта согласует корень сборки проекта. Поэтому код приводится к
   * непрозрачному субъекту здесь, в одном месте.
   */
  constructor(def: D, anySubject: ScreenCode<D, never>) {
    const code = anySubject as ScreenCode<D, unknown>;
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
      readonly calls: UcCalls;
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

  /**
   * Кадр по именованному примеру Def: `params` и `data` — по схемам,
   * `state` — по схеме, а без него в примере — начальное (`restoreState`).
   * Нет примера или значение не по схеме — бросок `CodeDefect` с полями.
   */
  exampleFrame(name: string): ScreenFrame {
    const check = new ExampleCheck(`Экран ${this.def.name}`);
    const example = check.find(this.def.examples, name);
    const where = `пример ${name}`;
    const params = check.value(
      this.def.params,
      example.params,
      `${where}: params`,
    );
    const data = check.value(
      this.logic.def.data,
      example.data,
      `${where}: data`,
    );
    const schema = this.def.state;
    const state =
      schema === undefined || example.state === undefined
        ? this.logic.restoreState(undefined, data)
        : check.value(schema, example.state, `${where}: state`);
    return { params, data, state };
  }

  /**
   * Действия и локальные действия для вида. Порядок: «только чтение»
   * отключает действия с `uc` текстом ядра (функция доступности не
   * зовётся), затем ответ кода экрана; скрытое в вид не попадает.
   */
  present(frame: ScreenFrame, context: RenderContext): UnitPresentation {
    const { data, state } = this.typed(frame);
    const ctx = this.judged(frame, context);
    const actions: ActionView[] = [];
    for (const action of Object.values<ScreenAction>(this.def.actions)) {
      const name = this.actionName(action.name);
      const answer: Availability =
        context.readOnly && action.uc !== undefined
          ? { kind: 'disabled', text: ScreenUnit.READ_ONLY_TEXT }
          : this.logic.availability(name, ctx);
      if (answer.kind === 'hidden') continue;
      actions.push({
        name: action.name,
        ...(action.hint === undefined ? {} : { hint: action.hint }),
        availability: answer,
        fields: this.logic.fields(name, data, state),
        ...(action.confirm === undefined ? {} : { confirm: action.confirm }),
      });
    }
    const locals: LocalView[] = [];
    for (const local of Object.values<ScreenLocal>(this.def.locals)) {
      const name = this.localName(local.name);
      const answer = this.logic.availability(name, ctx);
      if (answer.kind === 'hidden') continue;
      locals.push({
        name: local.name,
        ...(local.hint === undefined ? {} : { hint: local.hint }),
        availability: answer,
        fields: this.logic.fields(name, data, state),
      });
    }
    return { actions, locals };
  }

  /** Ответ кода о действии или локальном действии манифеста сейчас. */
  availability(
    name: string,
    frame: ScreenFrame,
    context: ActionContext,
  ): Availability {
    const known = this.hasLocal(name)
      ? this.localName(name)
      : this.actionName(name);
    return this.logic.availability(known, this.judged(frame, context));
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

  /** Вход функции доступности: кадр, субъект и контекст кода (место и субъект). */
  private judged(
    frame: ScreenFrame,
    context: ActionContext,
  ): AvailabilityContext<D> {
    const { data, state } = this.typed(frame);
    const { locale, timeZone, subject } = context;
    return {
      params: this.typedParams(frame.params),
      data,
      state,
      subject,
      context: { locale, timeZone, subject },
    };
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
   * юнита или `ScreenPreview`: параметры — из адреса или `exampleFrame` по
   * схеме `params`, данные и состояние — из `load` или `exampleFrame` выше
   * (схемы `data`, `state`).
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
