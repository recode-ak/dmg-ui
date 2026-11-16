import { toJsonSchema } from 'dmg-core';
import type {
  InputSchema,
  LocalSpec,
  NormalizedLocal,
} from './screen-def.types';

/**
 * Локальное действие экрана: тексты и вход. Функцию состояния даёт код
 * экрана; узлом графа не становится (Т-6).
 */
export class ScreenLocal<
  I extends InputSchema | undefined = InputSchema | undefined,
> {
  readonly name: string;
  readonly label: string;
  readonly description: string;
  readonly input: I;

  constructor(name: string, spec: LocalSpec) {
    this.name = name;
    this.label = spec.label;
    this.description = spec.description;
    // Без `input` в спеке `I` — `undefined`, как у `ScreenAction`.
    this.input = spec.input as I;
  }

  normalize(): NormalizedLocal {
    return {
      name: this.name,
      label: this.label,
      description: this.description,
      input: this.input === undefined ? undefined : toJsonSchema(this.input),
    };
  }
}
