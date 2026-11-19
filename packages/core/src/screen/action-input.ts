import { err, ok, type Result } from 'dmg-core';
import type * as v from 'valibot';
import type { InputSchema } from '../manifest/screen-def.types';
import { FieldDescription } from '../schema/field-description';
import type { FieldKind } from '../schema/field-description.types';
import { SchemaCheck } from '../schema/schema-check';
import type { FieldIssue } from '../schema/schema-check.types';
import type { ActionField, InputRejection } from './action-input.types';
import type { Choice, FieldValues } from './screen-code.types';

export type { ActionField, InputRejection } from './action-input.types';

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
   * Поля входа в порядке схемы — описание `FieldDescription`. Варианты, если
   * их не задал код экрана: у булева — `Да` и `Нет`, у `picklist` — его
   * значения.
   */
  fields(): readonly ActionField[] {
    return Object.entries(this.schema.entries).map(([name, entry]) => {
      const { options, ...field } = new FieldDescription(
        name,
        entry,
      ).describe();
      const choices = ActionInput.implicitChoices(field.kind, options);
      return choices === undefined ? field : { ...field, choices };
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

  private static implicitChoices(
    kind: FieldKind,
    options: readonly string[] | undefined,
  ): readonly Choice[] | undefined {
    if (kind === 'boolean') {
      return [
        { value: true, label: 'Да' },
        { value: false, label: 'Нет' },
      ];
    }
    return options?.map((option) => ({ value: option, label: option }));
  }
}
