import { type DomainRuleDef, ErrorText, type Rule } from 'dmg-core';
import type { AvailabilityAnswer } from './availability.types';

export type { ViewAvailability } from './availability.types';

/** Ответ о действии: доступно, скрыто или отключено с причиной (D-UI-98). */
export type Availability = AvailabilityAnswer;

const AVAILABLE: Availability = { kind: 'available' };
const HIDDEN: Availability = { kind: 'hidden' };

/**
 * Помощники ответа о действии для карты `availability` кода экрана. Решение
 * берётся из тех же объектов, что исполняет UC: Policy (`policy`) и доменные
 * правила (`rule`) над `ReadonlyAr` из state; копий правил в UI нет. Ответ —
 * только показ: сервер перепроверяет каждый вызов (D-UI-29).
 */
export const Availability = {
  /** Доступно. */
  yes(): Availability {
    return AVAILABLE;
  },

  /** Скрыто: субъекту действие не положено, текста нет. */
  hidden(): Availability {
    return HIDDEN;
  },

  /** Отключено с причиной для человека. */
  disabled(text: string): Availability {
    return { kind: 'disabled', text };
  },

  /** Своё условие или признак из ответа query UC: ложно — отключено с текстом. */
  when(condition: boolean, text: string): Availability {
    return condition ? AVAILABLE : { kind: 'disabled', text };
  },

  /**
   * Право субъекта по Policy домена. Нет субъекта или отказ — скрыто:
   * `denyMessage` не показывается, отказ закрыт.
   */
  policy<U, C>(rule: Rule<U, C>, subject: U | undefined, ctx: C): Availability {
    if (subject === undefined) return HIDDEN;
    return rule.evaluate(subject, ctx).allowed ? AVAILABLE : HIDDEN;
  },

  /**
   * Доменное правило над состоянием: отказ — отключено с главной строкой
   * текста ошибки (`ErrorText`), без payload.
   */
  rule<C>(domainRule: DomainRuleDef<C>, ctx: C): Availability {
    const checked = domainRule.check(ctx);
    return checked.ok
      ? AVAILABLE
      : { kind: 'disabled', text: ErrorText.of(checked.error).summary };
  },

  /**
   * Контекст правила может быть не собран (например, ничего не выбрано):
   * нет — отключено с текстом автора, есть — ответ `then`. Policy и правила
   * принимают только полный контекст, поэтому путь из «может не быть» — здесь.
   */
  given<C>(
    ctx: C | undefined,
    missing: string,
    then: (ctx: C) => Availability,
  ): Availability {
    return ctx === undefined ? { kind: 'disabled', text: missing } : then(ctx);
  },

  /**
   * Сводка частей: скрыто, если скрыта любая; иначе первое отключённое по
   * порядку; иначе доступно.
   */
  all(...parts: readonly Availability[]): Availability {
    if (parts.some((part) => part.kind === 'hidden')) return HIDDEN;
    return parts.find((part) => part.kind === 'disabled') ?? AVAILABLE;
  },
} as const;
