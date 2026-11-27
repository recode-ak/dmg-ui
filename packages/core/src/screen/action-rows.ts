import { err, ok, type Result } from 'dmg-core';
import type { RowSpec } from '../manifest/screen-def.types';
import type { InputRejection } from './action-input.types';
import { CodeDefect } from './code-defect';
import type { Choice } from './screen-code.types';

/**
 * Строки действия строки по данным экземпляра: список — по пути `list`
 * через точку, вариант строки — `{ value: элемент[key], label: элемент[label] }`
 * в порядке списка. Родителя пути нет (необязательное поле) — строк нет.
 * Вход нажатия — единственное поле входа действия со значением ключа строки.
 * Форму держит UI-38; вход не из одного поля, данные не той формы (граф
 * пропущен) и повтор ключа — дефект, бросок `CodeDefect` без значений.
 * @see action-rows.test.ts
 */
export class ActionRows {
  /** Замечание входа, ключа которого нет среди строк текущих данных. */
  static readonly NOT_LISTED_TEXT = 'Строки нет в списке';

  private readonly field: string;

  /** `fields` — имена полей входа действия; не одно поле — бросок. */
  constructor(
    readonly spec: RowSpec,
    fields: readonly string[],
    private readonly where: string,
  ) {
    const [field] = fields;
    if (fields.length !== 1 || field === undefined) {
      throw this.defect('у входа действия строки не одно поле');
    }
    this.field = field;
  }

  /** Варианты строк текущих данных, в порядке списка. */
  of(data: unknown): readonly Choice[] {
    const rows = this.items(data).map((item) => this.choice(item));
    if (new Set(rows.map((row) => row.value)).size !== rows.length) {
      throw this.defect('ключи строк повторяются');
    }
    return rows;
  }

  /** Проверенный схемой вход: значение его поля — ключ строки текущих данных. */
  check(input: unknown, data: unknown): Result<undefined, InputRejection> {
    const value = this.valueOf(input, this.field);
    return this.of(data).some((row) => row.value === value)
      ? ok(undefined)
      : err({
          issues: [{ field: this.field, text: ActionRows.NOT_LISTED_TEXT }],
        });
  }

  private items(data: unknown): readonly unknown[] {
    let at: unknown = data;
    for (const step of this.spec.list.split('.')) {
      if (at === undefined) return [];
      at = this.member(at, step);
    }
    if (at === undefined) return [];
    if (!Array.isArray(at)) throw this.misshapen();
    return at;
  }

  private choice(item: unknown): Choice {
    const value = this.member(item, this.spec.key);
    const label = this.member(item, this.spec.label);
    const scalar =
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean';
    if (!scalar || typeof label !== 'string') throw this.misshapen();
    return { value, label };
  }

  private member(at: unknown, name: string): unknown {
    if (typeof at !== 'object' || at === null) throw this.misshapen();
    return this.valueOf(at, name);
  }

  private valueOf(at: unknown, name: string): unknown {
    return (at as Readonly<Record<string, unknown> | undefined>)?.[name];
  }

  private misshapen(): CodeDefect {
    return this.defect('данные не той формы');
  }

  private defect(text: string): CodeDefect {
    return new CodeDefect(`${this.where}: строки ${this.spec.list} — ${text}`);
  }
}
