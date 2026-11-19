import type { FieldShape } from '../schema/field-description.types';
import type { FieldIssue } from '../schema/schema-check.types';
import type { Choice } from './screen-code.types';

/**
 * Поле входа действия: описание по схеме (подпись, вид, признак
 * «необязательное», подсказка, пример, пределы), варианты и начальное
 * значение. Варианты `picklist` схемы уходят в `choices`, поэтому `options`
 * в поле нет.
 */
export type ActionField = Omit<FieldShape, 'options'> & {
  readonly choices?: readonly Choice[];
  readonly initial?: unknown;
};

/** Отказ на вход действия: замечания схемы по полям. */
export type InputRejection = {
  readonly issues: readonly FieldIssue[];
};
