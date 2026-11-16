import { type AnyUseCaseDef, toJsonSchema } from 'dmg-core';
import type {
  ActionSpec,
  AnyScreenDef,
  InputSchema,
  ItemTexts,
  NormalizedAction,
} from './screen-def.types';

/**
 * Действие экрана: тексты, вход, вызов command UC, переходы и подтверждение.
 * Узел графа под экраном; имя — ключ в `actions` спеки. `U` — Def UC
 * действия: по нему типизируются шаги кода (`ActionStep`).
 */
export class ScreenAction<
  I extends InputSchema | undefined = InputSchema | undefined,
  U extends AnyUseCaseDef | undefined = AnyUseCaseDef | undefined,
> {
  readonly name: string;
  readonly label: string;
  readonly description: string;
  readonly visible: boolean;
  readonly input: I;
  readonly uc: U;
  readonly confirm: ItemTexts | undefined;
  private readonly to: (() => readonly AnyScreenDef[]) | undefined;

  constructor(name: string, spec: ActionSpec) {
    this.name = name;
    this.label = spec.label;
    this.description = spec.description;
    this.visible = spec.visible ?? false;
    // Без `input` в спеке `I` — `undefined` (`InputSchemaOf`), то есть ровно
    // `spec.input`; TS не связывает отсутствие ключа с параметром типа.
    this.input = spec.input as I;
    // То же для `U` (`UcOf`): без `uc` в спеке — `undefined`.
    this.uc = spec.uc as U;
    this.confirm = spec.confirm;
    this.to = spec.to;
  }

  /** Экраны, куда ведёт действие, кроме своего: переход на свой экран разрешён неявно; раскрывает thunk `to`. */
  targets(): readonly AnyScreenDef[] {
    return this.to?.() ?? [];
  }

  normalize(): NormalizedAction {
    return {
      name: this.name,
      label: this.label,
      description: this.description,
      visible: this.visible,
      input: this.input === undefined ? undefined : toJsonSchema(this.input),
      uc: this.uc?.name,
      to: this.targets().map((screen) => screen.name),
      confirm: this.confirm,
    };
  }
}
