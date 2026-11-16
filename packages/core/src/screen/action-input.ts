import { err, ok, type Result } from 'dmg-core';
import * as v from 'valibot';
import type { InputSchema } from '../manifest/screen-def.types';
import { SchemaCheck } from '../schema/schema-check';
import type { FieldIssue } from '../schema/schema-check.types';
import type { ActionField, InputRejection } from './action-input.types';
import type { FieldValues } from './screen-code.types';

export type { ActionField, InputRejection } from './action-input.types';

/** Схема одного поля объекта входа. */
type EntrySchema = v.ObjectEntries[string];

/**
 * Вход действия над схемой `input` — объектом полей. Даёт поля для сбора
 * входа каналом и проверку сырого входа с отказом по полям.
 */
export class ActionInput<S extends InputSchema = InputSchema> {
  readonly schema: S;

  constructor(schema: S) {
    this.schema = schema;
  }

  /**
   * Поля входа в порядке схемы: подпись — `v.description` поля (у
   * необязательного — обёрнутой схемы), без описания — имя поля.
   */
  fields(): readonly ActionField[] {
    return Object.entries(this.schema.entries).map(([name, entry]) => {
      const wrapped = this.wrappedOf(entry);
      const label = v.getDescription(wrapped ?? entry) ?? name;
      return { name, label, optional: wrapped !== undefined };
    });
  }

  /** Сырой вход по схеме: выход схемы или все замечания по полям. */
  check(raw: unknown): Result<v.InferOutput<S>, InputRejection> {
    const res = new SchemaCheck(this.schema).run(raw);
    return res.ok ? res : err({ issues: res.error });
  }

  /**
   * Часть полей по их схемам — для начальных значений: каждое значение
   * проверяется схемой своего поля, ключ вне схемы — замечание.
   */
  checkFields(values: FieldValues): Result<FieldValues, InputRejection> {
    const out: Record<string, unknown> = {};
    const issues: FieldIssue[] = [];
    for (const [field, value] of Object.entries(values)) {
      const entry = this.schema.entries[field];
      if (entry === undefined) {
        issues.push({ field, text: 'Поля нет во входе действия' });
        continue;
      }
      const res = new SchemaCheck(entry).run(value);
      if (res.ok) out[field] = res.value;
      else issues.push(...res.error.map(({ text }) => ({ field, text })));
    }
    return issues.length === 0 ? ok(out) : err({ issues });
  }

  /** Обёрнутая схема необязательного поля; у обязательного — `undefined`. */
  private wrappedOf(entry: EntrySchema): v.GenericSchema | undefined {
    if (
      v.isOfType('optional', entry) ||
      v.isOfType('exact_optional', entry) ||
      v.isOfType('nullish', entry)
    ) {
      return entry.wrapped;
    }
    return undefined;
  }
}
