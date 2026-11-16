import { err, ok, type Result } from 'dmg-core';
import * as v from 'valibot';
import type { FieldIssue } from './schema-check.types';

export type { FieldIssue } from './schema-check.types';

/**
 * Проверка внешнего значения по схеме с отказом в форме замечаний по полям.
 * Одна форма отказа для адреса (`invalidParams`) и входа действия
 * (`InputRejection`): поле — ключ первого уровня из пути замечания, текст —
 * из схемы.
 */
export class SchemaCheck<S extends v.GenericSchema = v.GenericSchema> {
  readonly schema: S;

  constructor(schema: S) {
    this.schema = schema;
  }

  /** Выход схемы или все замечания, которые она нашла. */
  run(raw: unknown): Result<v.InferOutput<S>, readonly FieldIssue[]> {
    const parsed = v.safeParse(this.schema, raw);
    if (parsed.success) return ok(parsed.output);
    return err(parsed.issues.map((issue) => this.issueOf(issue)));
  }

  private issueOf(issue: v.BaseIssue<unknown>): FieldIssue {
    const key = issue.path?.[0]?.key;
    return key === undefined
      ? { text: issue.message }
      : { field: String(key), text: issue.message };
  }
}
