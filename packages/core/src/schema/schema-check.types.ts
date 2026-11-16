/** Замечание схемы: ключ первого уровня (если есть) и текст схемы. */
export type FieldIssue = {
  readonly field?: string;
  readonly text: string;
};
