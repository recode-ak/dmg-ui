import type { FIELD_KINDS } from './field-description.const';

/** Вид поля: по нему канал выбирает ввод и приведение строки. */
export type FieldKind = (typeof FIELD_KINDS)[number];

/**
 * Пределы значения поля из схемы. Для числа — `min`, `max`, `integer`; для
 * строки — `minLength`, `maxLength`. Пределов даты нет.
 */
export type FieldLimits = {
  readonly min?: number;
  readonly max?: number;
  readonly integer?: boolean;
  readonly minLength?: number;
  readonly maxLength?: number;
};

/** Пример значения поля — первый скаляр `v.examples` схемы. */
export type FieldExample = string | number | boolean;

/**
 * Описание поля входа по его схеме — данные JSON: едут в снимок беседы и в
 * провод канала. `options` — варианты `picklist`; у остальных видов их нет.
 */
export type FieldShape = {
  readonly name: string;
  readonly label: string;
  readonly kind: FieldKind;
  readonly optional: boolean;
  readonly hint?: string;
  readonly example?: FieldExample;
  readonly limits?: FieldLimits;
  readonly options?: readonly string[];
};

/** Действие проверки в pipe схемы: тип и требование (предел). */
export type PipeAction = {
  readonly type: string;
  readonly requirement: unknown;
};

/** Вид и то, что от него зависит: пределы и варианты. */
export type FieldCore = {
  readonly kind: FieldKind;
  readonly limits?: FieldLimits;
  readonly options?: readonly string[];
};
