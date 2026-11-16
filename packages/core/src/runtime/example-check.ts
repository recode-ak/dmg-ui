import type * as v from 'valibot';
import { SchemaCheck } from '../schema/schema-check';
import { CodeDefect } from '../screen/code-defect';

/**
 * Проверка именованного примера Def (экрана или уведомления): пример есть,
 * значения — по схемам. Пример пишет автор Def, ошибка в нём — ошибка
 * программиста: бросок `CodeDefect` с именами полей, без значений.
 */
export class ExampleCheck {
  private readonly owner: string;

  /** `owner` — начало текста дефекта, например «Экран taskList». */
  constructor(owner: string) {
    this.owner = owner;
  }

  /** Пример по имени; нет — бросок с именем примера. */
  find<T>(examples: Readonly<Record<string, T>>, name: string): T {
    const example = Object.hasOwn(examples, name) ? examples[name] : undefined;
    if (example === undefined) {
      throw new CodeDefect(`${this.owner}: нет примера ${name}`);
    }
    return example;
  }

  /** Значение примера по схеме; не по схеме — бросок с полями. */
  value<S extends v.GenericSchema>(
    schema: S,
    raw: unknown,
    where: string,
  ): v.InferOutput<S> {
    const checked = new SchemaCheck(schema).run(raw);
    if (checked.ok) return checked.value;
    const fields = checked.error.map((issue) => issue.field ?? '—');
    throw new CodeDefect(
      `${this.owner}, ${where} не по схеме (поля: ${fields.join(', ')})`,
    );
  }
}
