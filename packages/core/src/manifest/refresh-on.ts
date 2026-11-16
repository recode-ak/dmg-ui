import type { AnyEventDef } from 'dmg-core';
import type { NormalizedRefresh, RefreshSpec } from './screen-def.types';

/**
 * Событие перечитывания экрана: по payload события решает, какие
 * экземпляры экрана перечитать. Сравнивает ключи первого уровня.
 */
export class RefreshOn {
  readonly event: AnyEventDef;
  readonly params: Readonly<Record<string, string>>;
  readonly subject: string | undefined;
  readonly any: boolean;

  constructor(spec: RefreshSpec) {
    this.event = spec.event;
    this.params = spec.params ?? {};
    this.subject = spec.subject;
    this.any = spec.any ?? false;
  }

  /**
   * Перечитать ли экземпляр с параметрами `params` у субъекта `subjectId`.
   * Значения сравниваются, только когда есть оба: нет поля — `false`.
   * Запись без `params`, `subject` и `any` — нарушение правила графа; для неё
   * `false`: не перечитывать — безопасная сторона.
   */
  matches(
    payload: Readonly<Record<string, unknown>>,
    params: Readonly<Record<string, unknown>>,
    subjectId: string | undefined,
  ): boolean {
    if (this.any) return true;
    const pairs = Object.entries(this.params);
    if (pairs.length === 0 && this.subject === undefined) return false;
    if (this.subject !== undefined) {
      if (subjectId === undefined || payload[this.subject] !== subjectId) {
        return false;
      }
    }
    return pairs.every(([param, field]) => {
      const value = params[param];
      return value !== undefined && value === payload[field];
    });
  }

  normalize(): NormalizedRefresh {
    return {
      event: this.event.name,
      params: this.params,
      subject: this.subject,
      any: this.any,
    };
  }
}
