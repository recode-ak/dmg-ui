import * as v from 'valibot';
import type {
  FieldCore,
  FieldExample,
  FieldLimits,
  FieldShape,
  PipeAction,
} from './field-description.types';
import { FIELD_HINT_KEY } from './field-hint';

/** Действия pipe, по которым строка считается датой ISO. */
const DATE_ACTIONS: ReadonlySet<string> = new Set([
  'iso_date',
  'iso_date_time',
  'iso_timestamp',
]);

/**
 * Описание поля входа по его схеме valibot: подпись, вид, обязательность,
 * подсказка, пример и пределы. Одна схема на один канал-независимый разбор:
 * ни экрана, ни UI слой не знает, выход — данные JSON (`FieldShape`), их
 * каналы кладут в снимки и на провод.
 *
 * Необязательное поле (`optional`, `exact_optional`, `nullish`) читается на
 * двух уровнях: свои метаданные поля главнее, вид и пределы — обёрнутой
 * схемы. Вид не из поддержанных (массив, объект, `v.date()`) — `string`:
 * поле не должно ронять сборку вида.
 */
export class FieldDescription {
  private readonly name: string;
  private readonly entry: v.GenericSchema;
  /** Обёрнутая схема необязательного поля; у обязательного — `undefined`. */
  private readonly wrapped: v.GenericSchema | undefined;

  constructor(name: string, entry: v.GenericSchema) {
    this.name = name;
    this.entry = entry;
    this.wrapped = FieldDescription.wrappedOf(entry);
  }

  describe(): FieldShape {
    const { kind, limits, options } = this.core();
    const hint = this.hint();
    const example = this.example();
    return {
      name: this.name,
      label: this.label(),
      kind,
      optional: this.wrapped !== undefined,
      ...(hint === undefined ? {} : { hint }),
      ...(example === undefined ? {} : { example }),
      ...(limits === undefined ? {} : { limits }),
      ...(options === undefined ? {} : { options }),
    };
  }

  /**
   * Подпись: `title` поля, `title` обёрнутой схемы, `description` поля,
   * `description` обёрнутой схемы, имя поля.
   */
  private label(): string {
    const layers = this.layers();
    return (
      FieldDescription.first(layers, v.getTitle) ??
      FieldDescription.first(layers, v.getDescription) ??
      this.name
    );
  }

  private hint(): string | undefined {
    for (const layer of this.layers()) {
      const hint = v.getMetadata(layer)[FIELD_HINT_KEY];
      if (typeof hint === 'string' && hint !== '') return hint;
    }
    return undefined;
  }

  /**
   * Первый скаляр `v.examples`. У помеченного `F.sensitive` примера нет:
   * пример персональных данных видят все каналы.
   */
  private example(): FieldExample | undefined {
    const layers = this.layers();
    if (layers.some((layer) => v.getMetadata(layer).sensitive === true)) {
      return undefined;
    }
    for (const layer of layers) {
      for (const example of v.getExamples(layer)) {
        if (FieldDescription.isScalar(example)) return example;
      }
    }
    return undefined;
  }

  /** Вид, пределы и варианты по схеме без обёртки необязательности. */
  private core(): FieldCore {
    const schema = this.wrapped ?? this.entry;
    switch (schema.type) {
      case 'number':
        return this.limited('number', schema);
      case 'boolean':
        return { kind: 'boolean' };
      case 'picklist':
        return FieldDescription.picklist(schema);
      case 'enum':
        return { kind: 'choice' };
      case 'union':
        return FieldDescription.isLiterals(schema)
          ? { kind: 'choice' }
          : { kind: 'string' };
      case 'string':
        return FieldDescription.actionsOf(schema).some(({ type }) =>
          DATE_ACTIONS.has(type),
        )
          ? { kind: 'date' }
          : this.limited('string', schema);
      default:
        return { kind: 'string' };
    }
  }

  /** `choice` с вариантами `picklist`; варианты не строки — без списка. */
  private static picklist(schema: object): FieldCore {
    const options = 'options' in schema ? schema.options : undefined;
    if (!Array.isArray(options)) return { kind: 'choice' };
    const strings = options.filter((o) => typeof o === 'string');
    return strings.length === options.length
      ? { kind: 'choice', options: strings }
      : { kind: 'choice' };
  }

  /** Union из одних литералов — выбор из значений. */
  private static isLiterals(schema: object): boolean {
    const options = 'options' in schema ? schema.options : undefined;
    return (
      Array.isArray(options) &&
      options.length > 0 &&
      options.every(
        (o) =>
          typeof o === 'object' &&
          o !== null &&
          'type' in o &&
          o.type === 'literal',
      )
    );
  }

  /** Вид с пределами из pipe схемы; нет пределов — ключа `limits` нет. */
  private limited(
    kind: 'number' | 'string',
    schema: v.GenericSchema,
  ): FieldCore {
    const actions = FieldDescription.actionsOf(schema);
    const limits =
      kind === 'number'
        ? FieldDescription.numberLimits(actions)
        : FieldDescription.lengthLimits(actions);
    return Object.keys(limits).length === 0 ? { kind } : { kind, limits };
  }

  /** `min`, `max` и `integer` по действиям `minValue`, `maxValue`, `integer`; при нескольких — строже. */
  private static numberLimits(actions: readonly PipeAction[]): FieldLimits {
    let min: number | undefined;
    let max: number | undefined;
    let integer = false;
    for (const { type, requirement } of actions) {
      if (type === 'integer') integer = true;
      if (typeof requirement !== 'number') continue;
      if (type === 'min_value') min = FieldDescription.upper(min, requirement);
      if (type === 'max_value') max = FieldDescription.lower(max, requirement);
    }
    return {
      ...(min === undefined ? {} : { min }),
      ...(max === undefined ? {} : { max }),
      ...(integer ? { integer } : {}),
    };
  }

  /** `minLength` и `maxLength` по `minLength`, `maxLength`, `length`, `nonEmpty`. */
  private static lengthLimits(actions: readonly PipeAction[]): FieldLimits {
    let minLength: number | undefined;
    let maxLength: number | undefined;
    for (const { type, requirement } of actions) {
      if (type === 'non_empty') {
        minLength = FieldDescription.upper(minLength, 1);
      }
      if (typeof requirement !== 'number') continue;
      if (type === 'min_length' || type === 'length') {
        minLength = FieldDescription.upper(minLength, requirement);
      }
      if (type === 'max_length' || type === 'length') {
        maxLength = FieldDescription.lower(maxLength, requirement);
      }
    }
    return {
      ...(minLength === undefined ? {} : { minLength }),
      ...(maxLength === undefined ? {} : { maxLength }),
    };
  }

  /** Большее из двух; у нижнего предела побеждает строже. */
  private static upper(current: number | undefined, next: number): number {
    return current === undefined ? next : Math.max(current, next);
  }

  /** Меньшее из двух; у верхнего предела побеждает строже. */
  private static lower(current: number | undefined, next: number): number {
    return current === undefined ? next : Math.min(current, next);
  }

  /** Схемы, у которых читаются метаданные: поле, затем обёрнутая. */
  private layers(): readonly v.GenericSchema[] {
    return this.wrapped === undefined
      ? [this.entry]
      : [this.entry, this.wrapped];
  }

  /** Первое найденное чтецом значение по схемам по порядку. */
  private static first(
    layers: readonly v.GenericSchema[],
    read: (schema: v.GenericSchema) => string | undefined,
  ): string | undefined {
    for (const layer of layers) {
      const found = read(layer);
      if (found !== undefined) return found;
    }
    return undefined;
  }

  private static wrappedOf(
    entry: v.GenericSchema,
  ): v.GenericSchema | undefined {
    const optional =
      entry.type === 'optional' ||
      entry.type === 'exact_optional' ||
      entry.type === 'nullish';
    if (!optional || !('wrapped' in entry)) return undefined;
    return FieldDescription.isSchema(entry.wrapped) ? entry.wrapped : undefined;
  }

  private static isSchema(node: unknown): node is v.GenericSchema {
    return (
      typeof node === 'object' &&
      node !== null &&
      'kind' in node &&
      node.kind === 'schema'
    );
  }

  private static isScalar(value: unknown): value is FieldExample {
    return (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    );
  }

  /**
   * Действия проверки схемы в порядке pipe; вложенные pipe раскрываются.
   * Схема без pipe действий не имеет.
   */
  private static actionsOf(schema: object): readonly PipeAction[] {
    const out: PipeAction[] = [];
    if (!('pipe' in schema) || !Array.isArray(schema.pipe)) return out;
    for (const item of schema.pipe) {
      const node: unknown = item;
      if (typeof node !== 'object' || node === null) continue;
      if ('pipe' in node) {
        out.push(...FieldDescription.actionsOf(node));
      } else if (
        'kind' in node &&
        node.kind === 'validation' &&
        'type' in node &&
        typeof node.type === 'string'
      ) {
        out.push({
          type: node.type,
          requirement: 'requirement' in node ? node.requirement : undefined,
        });
      }
    }
    return out;
  }
}
