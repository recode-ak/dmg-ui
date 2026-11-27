import type { RowSpec } from '../manifest/screen-def.types';
import { CodeDefect } from './code-defect';
import type { Choice } from './screen-code.types';

/**
 * Строки действия строки по данным экземпляра: список — по пути `list`
 * через точку, вариант строки — `{ value: элемент[key], label: элемент[label] }`
 * в порядке списка. Родителя пути нет (необязательное поле) — строк нет.
 * Форму пути и элемента сверяет правило графа; данные не той формы — дефект
 * кода экрана, бросок `CodeDefect` с путём, без значений.
 */
export class ActionRows {
  /** Замечание входа, ключа которого нет среди строк текущих данных. */
  static readonly NOT_LISTED_TEXT = 'Строки нет в списке';

  constructor(
    readonly spec: RowSpec,
    private readonly where: string,
  ) {}

  /** Варианты строк текущих данных, в порядке списка. */
  of(data: unknown): readonly Choice[] {
    return this.list(data).map((item, i) => this.choice(item, i));
  }

  /** Есть ли строка с ключом `value` в текущих данных. */
  has(data: unknown, value: unknown): boolean {
    return this.of(data).some((choice) => choice.value === value);
  }

  private list(data: unknown): readonly unknown[] {
    let at: unknown = data;
    for (const step of this.spec.list.split('.')) {
      if (at === undefined || at === null) return [];
      if (typeof at !== 'object') return this.defect('родитель пути не объект');
      at = (at as Readonly<Record<string, unknown>>)[step];
    }
    if (at === undefined || at === null) return [];
    if (!Array.isArray(at)) return this.defect('путь ведёт не к массиву');
    return at;
  }

  private choice(item: unknown, i: number): Choice {
    if (typeof item !== 'object' || item === null) {
      return this.defect(`строка ${i} не объект`);
    }
    const fields = item as Readonly<Record<string, unknown>>;
    const value = fields[this.spec.key];
    const label = fields[this.spec.label];
    if (
      typeof value !== 'string' &&
      typeof value !== 'number' &&
      typeof value !== 'boolean'
    ) {
      return this.defect(`ключ ${this.spec.key} строки ${i} не значение`);
    }
    if (typeof label !== 'string') {
      return this.defect(`подпись ${this.spec.label} строки ${i} не строка`);
    }
    return { value, label };
  }

  private defect(text: string): never {
    throw new CodeDefect(`${this.where}: строки ${this.spec.list} — ${text}`);
  }
}
