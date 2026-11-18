import { err, ok, type Result, toJsonSchema } from 'dmg-core';
import type { AnyScreenDef } from 'dmg-ui';
import { PAGE_URL_INTEGER, PAGE_URL_NAME } from './page-urls.const';
import type { PageParamKind } from './page-urls.types';

/**
 * Вид параметров экрана в URL: строка, целое или булево — по JSON Schema
 * параметров, без разбора устройства valibot. Значение после перевода
 * проверяет сама схема экрана (`AddressCodec.decode`), здесь — только вид.
 * @see ./page-urls.test.ts
 */
export class PageParams {
  private constructor(
    private readonly kinds: ReadonlyMap<string, PageParamKind>,
  ) {}

  /** Вид параметров экрана `id`; невыразимая в URL схема — бросок сборки. */
  static of(id: string, def: AnyScreenDef): PageParams {
    let schema: Readonly<Record<string, unknown>>;
    try {
      schema = { ...toJsonSchema(def.params) };
    } catch {
      // Непереводимое (`v.date()`) бросает без `id` экрана — свой текст.
      throw new Error(`PageUrls: параметры экрана ${id} не выражаются в URL`);
    }
    const read = PageParams.read(id, schema);
    if (!read.ok) throw new Error(`PageUrls: ${read.error[0]}`);
    return read.value;
  }

  /**
   * Вид параметров по JSON Schema параметров экрана `id`; в отказе — все
   * замечания по порядку полей. `properties` не запись — параметров нет.
   */
  static read(
    id: string,
    schema: Readonly<Record<string, unknown>>,
  ): Result<PageParams, readonly string[]> {
    const properties = schema.properties;
    const fields =
      typeof properties === 'object' &&
      properties !== null &&
      !Array.isArray(properties)
        ? Object.entries(properties)
        : [];
    const kinds = new Map<string, PageParamKind>();
    const remarks: string[] = [];
    for (const [name, property] of fields) {
      if (!PAGE_URL_NAME.test(name)) {
        remarks.push(`имя параметра ${name} экрана ${id} не выражается в URL`);
        continue;
      }
      const type =
        typeof property === 'object' && property !== null
          ? (property as { readonly type?: unknown }).type
          : undefined;
      if (type === 'string' || type === 'integer' || type === 'boolean') {
        kinds.set(name, type);
      } else {
        remarks.push(
          `параметр ${name} экрана ${id} не выражается в URL: нужна строка, целое или булево`,
        );
      }
    }
    return remarks.length === 0 ? ok(new PageParams(kinds)) : err(remarks);
  }

  /** Имена параметров в порядке схемы. */
  names(): readonly string[] {
    return [...this.kinds.keys()];
  }

  has(name: string): boolean {
    return this.kinds.has(name);
  }

  /** Значение своего адреса → текст; значение не того вида — бросок. */
  text(name: string, value: unknown): string {
    const kind = this.kind(name);
    switch (kind) {
      case 'string':
        if (typeof value === 'string') return value;
        break;
      case 'integer':
        if (Number.isSafeInteger(value)) return String(value);
        break;
      case 'boolean':
        if (typeof value === 'boolean') return String(value);
        break;
      default: {
        const never: never = kind;
        throw new Error(`PageUrls: вид параметра ${String(never)}`);
      }
    }
    throw new Error(`PageUrls: значение параметра ${name} не вида ${kind}`);
  }

  /** Текст из URL → значение по виду; не по шаблону вида — отказ. */
  value(name: string, text: string): Result<unknown, 'invalid'> {
    const kind = this.kind(name);
    switch (kind) {
      case 'string':
        return ok(text);
      case 'integer': {
        if (!PAGE_URL_INTEGER.test(text)) return err('invalid');
        const value = Number(text);
        return Number.isSafeInteger(value) ? ok(value) : err('invalid');
      }
      case 'boolean':
        if (text === 'true') return ok(true);
        if (text === 'false') return ok(false);
        return err('invalid');
      default: {
        const never: never = kind;
        throw new Error(`PageUrls: вид параметра ${String(never)}`);
      }
    }
  }

  /** Вид объявленного параметра; чужое имя — ошибка программиста, бросок. */
  private kind(name: string): PageParamKind {
    const kind = this.kinds.get(name);
    if (kind === undefined) {
      throw new Error(`PageUrls: параметра ${name} у экрана нет`);
    }
    return kind;
  }
}
