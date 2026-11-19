import type { FieldKind, FieldLimits } from './field-description.types';
import type { FieldInputSpec } from './field-input.types';

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
    if (!NUMBER_PATTERN.test(text)) return raw;
    const number = Number(text);
    return Number.isFinite(number) ? number : raw;
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
    if (min === undefined) {
      return max === undefined
        ? undefined
        : `не длиннее ${max} ${FieldInput.chars(max)}`;
    }
    if (min === max) return `ровно ${min} ${FieldInput.chars(min, true)}`;
    if (max === undefined) {
      return min === 1
        ? 'не пустое'
        : `не короче ${min} ${FieldInput.chars(min)}`;
    }
    return `от ${min} до ${max} ${FieldInput.chars(max)}`;
  }

  /**
   * «символ» в форме, согласованной с числом. После «ровно» — именительный
   * падеж: 1 символ, 2 символа, 5 символов, 21 символ. После «от», «до»,
   * «не короче», «не длиннее» число стоит в родительном: 1 символа,
   * 2 символов, 21 символа.
   */
  private static chars(count: number, nominative = false): string {
    const n = Math.abs(count);
    const teen = n % 100 >= 11 && n % 100 <= 14;
    const last = n % 10;
    if (teen) return 'символов';
    if (last === 1) return nominative ? 'символ' : 'символа';
    if (nominative && last >= 2 && last <= 4) return 'символа';
    return 'символов';
  }
}
