import type { AnyUseCaseDef } from 'dmg-core';
import { Address } from '../address/address';
import type { ScreenAction } from '../manifest/screen-action';
import { SchemaCheck } from '../schema/schema-check';
import type { Transition } from '../screen/transition.types';
import type { ActionEnd, ActionRunSpec } from './action-run.types';
import type {
  ActionOutcome,
  Refusal,
  UnavailableReason,
} from './outcome.types';
import type {
  ErasedStep,
  ErasedStepContext,
  ScreenFrame,
} from './screen-unit.types';

export type {
  ActionEnd,
  ActionRunSpec,
  ActRequest,
  LocalRequest,
} from './action-run.types';

/**
 * Одно исполнение действия по порядку брифа: закрыт → ревизия → имя →
 * «только чтение» → доступность → подтверждение → вход → `command` → UC →
 * `done`/`caught` → проверка перехода. Не бросает: бросок кода экрана,
 * необъявленный переход или выход — дефект и отказ `SERVER_INTERNAL`.
 */
export class ActionRun {
  private readonly spec: ActionRunSpec;

  constructor(spec: ActionRunSpec) {
    this.spec = spec;
  }

  async run(): Promise<ActionEnd> {
    const { unit, frame, closed, revision, context, request } = this.spec;
    if (closed) return this.unavailable('closed');
    if (request.revision !== revision) {
      return this.end({ kind: 'stale', revision });
    }
    const action = unit.action(request.action);
    if (action === undefined) return this.unavailable('unknown');
    if (context.readOnly && action.uc !== undefined) {
      return this.unavailable('readOnly');
    }
    if (frame === undefined) return this.unavailable('disabled');
    try {
      return await this.perform(action, frame);
    } catch (error) {
      return this.defect(error);
    }
  }

  private async perform(
    action: ScreenAction,
    frame: ScreenFrame,
  ): Promise<ActionEnd> {
    const { unit, context, request } = this.spec;
    if (!unit.available(action.name, frame)) {
      return this.unavailable('disabled');
    }
    if (action.confirm !== undefined && request.confirmed !== true) {
      const { label, description } = action.confirm;
      return this.end({ kind: 'confirm', label, description });
    }
    const input = unit.checkInput(action.name, request.input);
    if (!input.ok)
      return this.end({ kind: 'rejected', issues: input.error.issues });
    const ctx: ErasedStepContext = {
      ...frame,
      input: input.value,
      context: { locale: context.locale, timeZone: context.timeZone },
    };
    const step = unit.step(action.name);
    if (action.uc === undefined) {
      return this.settle(action, frame, step.done(ctx, undefined));
    }
    const answer = await this.call(action.uc, step, ctx);
    return 'refusal' in answer
      ? this.refused(answer.refusal)
      : this.settle(action, frame, answer.transition);
  }

  /** Вызов UC действия и шаг по ответу: `done`, `caught` или отказ. */
  private async call(
    uc: AnyUseCaseDef,
    step: ErasedStep,
    ctx: ErasedStepContext,
  ): Promise<
    { readonly transition: Transition } | { readonly refusal: Refusal }
  > {
    const { unit, node, ucs, request } = this.spec;
    const input = step.command === undefined ? ctx.input : step.command(ctx);
    const wire = await ucs.call({
      node,
      uc: uc.name,
      input,
      trace: request.trace,
    });
    const result = uc.restoreResult(wire);
    if (result.ok) return { transition: step.done(ctx, result.value) };
    if (step.caught !== undefined && unit.refusals.catches(result.error.code)) {
      return { transition: step.caught(ctx, result.error) };
    }
    return { refusal: unit.refusals.of(result.error) };
  }

  /** Проверка перехода по манифесту; необъявленное — бросок (дефект в `run`). */
  private settle(
    action: ScreenAction,
    frame: ScreenFrame,
    transition: Transition,
  ): ActionEnd {
    const { unit, codec } = this.spec;
    const where = `Экран ${unit.def.name}, действие ${action.name}`;
    if (transition instanceof Address) {
      const target = transition.screen;
      if (target === unit.def) {
        // Параметры обеих сторон — выход одной схемы `params`: порядок
        // ключей один, сравнение через JSON корректно.
        const same =
          JSON.stringify(transition.params) === JSON.stringify(frame.params);
        if (same) return { kind: 'stay' };
      } else if (!action.targets().includes(target)) {
        throw new Error(`${where}: переход на экран ${target.name} вне to`);
      }
      return this.end({ kind: 'moved', address: codec.encode(transition) });
    }
    return this.end(this.exited(where, transition));
  }

  /** Выход своего экрана с данными по схеме выхода. */
  private exited(where: string, value: unknown): ActionOutcome {
    if (typeof value !== 'object' || value === null || !('exit' in value)) {
      throw new Error(`${where}: переход — не адрес и не выход`);
    }
    const { exit } = value;
    const exits = this.spec.unit.def.exits;
    if (typeof exit !== 'string' || !Object.hasOwn(exits, exit)) {
      throw new Error(`${where}: выход ${String(exit)} не из exits экрана`);
    }
    const data = 'data' in value ? value.data : undefined;
    const schema = exits[exit]?.data;
    if (schema !== undefined && !new SchemaCheck(schema).run(data).ok) {
      throw new Error(`${where}: данные выхода ${exit} не по схеме`);
    }
    return data === undefined
      ? { kind: 'exited', exit }
      : { kind: 'exited', exit, data };
  }

  private refused(refusal: Refusal): ActionEnd {
    const { actionNode, request, records } = this.spec;
    records.refused(actionNode, request.trace, refusal);
    return this.end({ kind: 'refused', refusal });
  }

  private defect(cause: unknown): ActionEnd {
    const { unit, actionNode, request, records } = this.spec;
    records.defect(actionNode, request.trace, cause);
    return this.end({ kind: 'refused', refusal: unit.refusals.defect() });
  }

  private unavailable(reason: UnavailableReason): ActionEnd {
    return this.end({ kind: 'unavailable', reason });
  }

  private end(outcome: ActionOutcome): ActionEnd {
    return { kind: 'outcome', outcome };
  }
}
