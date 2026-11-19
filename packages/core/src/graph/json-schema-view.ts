import type { UnsupportedField } from './json-schema-view.types';

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

  /**
   * Пути чувствительных полей (`sensitive: true`), у которых есть `examples`:
   * обход `properties` и `items` рекурсивно, путь — как у `undescribed`.
   * Обёртки `anyOf` / `oneOf` не разбираются.
   */
  sensitiveWithExamples(prefix = ''): string[] {
    const found: string[] = [];
    const properties = JsonSchemaView.record(this.schema.properties);
    for (const [name, child] of Object.entries(properties)) {
      if (!JsonSchemaView.isRecord(child)) continue;
      const path = prefix === '' ? name : `${prefix}.${name}`;
      if (child.sensitive === true && child.examples !== undefined) {
        found.push(path);
      }
      found.push(...new JsonSchemaView(child).sensitiveWithExamples(path));
    }
    const items = this.schema.items;
    if (JsonSchemaView.isRecord(items)) {
      const path = `${prefix}[]`;
      if (items.sensitive === true && items.examples !== undefined) {
        found.push(path);
      }
      found.push(...new JsonSchemaView(items).sensitiveWithExamples(path));
    }
    return found;
  }

  /**
   * Поля первого уровня вида `array` или `object`: ввода человека для них
   * нет. `anyOf` / `oneOf` / `$ref` не разбираются.
   */
  unsupportedFields(): UnsupportedField[] {
    const found: UnsupportedField[] = [];
    const properties = JsonSchemaView.record(this.schema.properties);
    for (const [name, child] of Object.entries(properties)) {
      if (!JsonSchemaView.isRecord(child)) continue;
      if (child.type === 'array' || child.type === 'object') {
        found.push({ name, kind: child.type });
      }
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
