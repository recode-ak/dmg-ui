import {
  type AnyErrorDef,
  CoreErrors,
  type DomainError,
  ErrorText,
} from 'dmg-core';
import type { Refusal } from './outcome.types';

/**
 * Отказ для канала по ошибке и `catches` экрана: текст — только главная
 * строка `ErrorText` (поля валидации человеку не идут, DEBT-3 `dmg-core`).
 */
export class RefusalText {
  private readonly codes: ReadonlySet<string>;

  constructor(catches: readonly AnyErrorDef[]) {
    this.codes = new Set(catches.map((def) => def.code));
  }

  /** У экрана свой ответ на этот код. */
  catches(code: string): boolean {
    return this.codes.has(code);
  }

  of(error: DomainError): Refusal {
    return {
      code: error.code,
      text: ErrorText.of(error).summary,
      caught: this.catches(error.code),
    };
  }

  /** Отказ на дефект кода экрана: `SERVER_INTERNAL`, своего ответа нет. */
  defect(): Refusal {
    const error = CoreErrors.SERVER_INTERNAL.make();
    return {
      code: error.code,
      text: ErrorText.of(error).summary,
      caught: false,
    };
  }
}
