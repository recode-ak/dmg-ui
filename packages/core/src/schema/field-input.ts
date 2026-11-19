import type { FieldKind, FieldLimits } from './field-description.types';

/** Часть описания поля, которой хватает вводу: вид и пределы. */
type FieldInputSpec = {
  readonly kind: FieldKind;
  readonly limits?: FieldLimits;
};

/** Строка, которую приводят к числу: знак, целая часть, дробная через точку. */
const NUMBER_PATTERN = /^[+-]?\d+(\.\d+)?$/;

/**
 * Ввод поля по его виду: приводит сырую строку канала к значению и пишет
 * пределы человеку. Схемы не знает: то, что не приведено, отвергает схема
 * поля своим текстом ошибки, а один класс на все каналы не даёт им разойтись в
 * том, что считается числом.
 */
export class FieldInput {
  private readonly kind: FieldKind;
  private readonly limits: FieldLimits | undefined;

  constructor(spec: FieldInputSpec) {
    this.kind = spec.kind;
    this.limits = spec.limits;
  }

  /**
   * Значение по строке: число — десятичная запись (`3`, `-1`, `+5`, `2.5`)
   * после обрезки пробелов; всё прочее, включая пустую строку и «1e3»,
   * остаётся строкой. Остальные виды — строка как есть.
   */
  value(raw: string): string | number {
    if (this.kind !== 'number') return raw;
    const text = raw.trim();
    return NUMBER_PATTERN.test(text) ? Number(text) : raw;
  }

  /**
   * Пределы одной строкой: «от 1 до 99, целое», «от 1 до 100 символов»;
   * пределов нет — `undefined`.
   */
  limitsText(): string | undefined {
    const { limits } = this;
    if (limits === undefined) return undefined;
    const parts = [
      FieldInput.range(limits.min, limits.max),
      limits.integer ? 'целое' : undefined,
      FieldInput.length(limits.minLength, limits.maxLength),
    ].filter((part) => part !== undefined);
    return parts.length === 0 ? undefined : parts.join(', ');
  }

  /** «от 1 до 99», «от 1», «до 99»; нет границ — `undefined`. */
  private static range(
    min: number | undefined,
    max: number | undefined,
  ): string | undefined {
    if (min === undefined && max === undefined) return undefined;
    if (max === undefined) return `от ${min}`;
    if (min === undefined) return `до ${max}`;
    return `от ${min} до ${max}`;
  }

  /** Длина строки словами; нет границ — `undefined`. */
  private static length(
    min: number | undefined,
    max: number | undefined,
  ): string | undefined {
    if (min === undefined && max === undefined) return undefined;
    if (min !== undefined && min === max) return `ровно ${min} символов`;
    if (max === undefined) return `не короче ${min} символов`;
    if (min === undefined) return `не длиннее ${max} символов`;
    return `от ${min} до ${max} символов`;
  }
}
