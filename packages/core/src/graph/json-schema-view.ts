/**
 * Чтение JSON Schema, пришедшей в `props` узла графа: тип, строгость и поля
 * без `description`. Схема — произвольный объект, поэтому каждый шаг сужается
 * проверкой, а не приведением типа.
 */
export class JsonSchemaView {
  constructor(private readonly schema: Readonly<Record<string, unknown>>) {}

  /** Корень — объект (`type: 'object'`). */
  isObject(): boolean {
    return this.schema.type === 'object';
  }

  /** Лишние ключи запрещены (`additionalProperties: false`). */
  isStrict(): boolean {
    return this.isObject() && this.schema.additionalProperties === false;
  }

  /** Имена полей первого уровня. */
  fields(): string[] {
    return Object.keys(JsonSchemaView.record(this.schema.properties));
  }

  /**
   * Пути полей без `description`: обход `properties` и `items` рекурсивно,
   * путь — имена через точку, элемент массива — `[]`.
   */
  undescribed(prefix = ''): string[] {
    const found: string[] = [];
    const properties = JsonSchemaView.record(this.schema.properties);
    for (const [name, child] of Object.entries(properties)) {
      if (!JsonSchemaView.isRecord(child)) continue;
      const path = prefix === '' ? name : `${prefix}.${name}`;
      if (!JsonSchemaView.hasText(child.description)) found.push(path);
      found.push(...new JsonSchemaView(child).undescribed(path));
    }
    const items = this.schema.items;
    if (JsonSchemaView.isRecord(items)) {
      found.push(...new JsonSchemaView(items).undescribed(`${prefix}[]`));
    }
    return found;
  }

  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private static record(value: unknown): Record<string, unknown> {
    return JsonSchemaView.isRecord(value) ? value : {};
  }

  private static hasText(value: unknown): boolean {
    return typeof value === 'string' && value.trim() !== '';
  }
}
