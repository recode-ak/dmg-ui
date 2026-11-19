import type { FieldKind, FieldLimits } from './field-description.types';

/** Часть описания поля, которой хватает вводу: вид и пределы. */
export type FieldInputSpec = {
  readonly kind: FieldKind;
  readonly limits?: FieldLimits;
};
