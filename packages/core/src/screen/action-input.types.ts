import type * as v from 'valibot';
import type { FieldIssue } from '../schema/schema-check.types';
import type { Choice } from './screen-code.types';

/**
 * Поле входа действия: имя, подпись из схемы, признак «необязательное»,
 * варианты и начальное значение из кода экрана.
 */
export type ActionField = {
  readonly name: string;
  readonly label: string;
  readonly optional: boolean;
  readonly choices?: readonly Choice[];
  readonly initial?: unknown;
};

/** Отказ на вход действия: замечания схемы по полям. */
export type InputRejection = {
  readonly issues: readonly FieldIssue[];
};

/** Схема одного поля объекта входа. */
export type EntrySchema = v.ObjectEntries[string];
