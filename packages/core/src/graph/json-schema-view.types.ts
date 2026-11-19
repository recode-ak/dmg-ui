/** Поле первого уровня схемы, вид которого человек вводом не задаёт. */
export type UnsupportedField = {
  readonly name: string;
  readonly kind: 'array' | 'object';
};
