import { toJsonSchema } from 'dmg-core';
import * as v from 'valibot';
import type {
  AnyScreenDef,
  ExitSpec,
  NormalizedExit,
} from './screen-def.types';
import type { ExitValue } from './screen-exit.types';

export type { ExitValue } from './screen-exit.types';

/**
 * Выход экрана: экран завершил сторис с именованным итогом. Исход сторис
 * ссылается на выход (`OutcomeSpec.exits`), код действия возвращает его
 * значение через `with`.
 */
export class ScreenExit {
  readonly screen: AnyScreenDef;
  readonly name: string;
  readonly label: string;
  readonly description: string;
  readonly data: v.GenericSchema | undefined;

  constructor(screen: AnyScreenDef, name: string, spec: ExitSpec) {
    this.screen = screen;
    this.name = name;
    this.label = spec.label;
    this.description = spec.description;
    this.data = spec.data;
  }

  /**
   * Значение выхода для перехода: данные не по схеме — ошибка
   * программиста, бросок. У выхода без схемы данных нет.
   */
  with(data?: unknown): ExitValue {
    if (this.data === undefined) return { exit: this.name };
    const parsed = v.safeParse(this.data, data);
    if (!parsed.success) {
      throw new Error(
        `Выход ${this.screen.name}.${this.name}: данные не по схеме — ${v.summarize(parsed.issues)}`,
      );
    }
    return { exit: this.name, data: parsed.output };
  }

  normalize(): NormalizedExit {
    return {
      name: this.name,
      label: this.label,
      description: this.description,
      data: this.data === undefined ? undefined : toJsonSchema(this.data),
    };
  }
}
