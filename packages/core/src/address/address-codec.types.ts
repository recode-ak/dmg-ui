import type { FieldIssue } from '../schema/schema-check.types';

/**
 * Адрес в форме JSON: `id` экрана и параметры. Строку из него делает
 * канал.
 */
export type AddressJson = {
  readonly screen: string;
  readonly params: unknown;
};

/** Отказ декодировать адрес из внешних данных. */
export type AddressRejection =
  | { readonly reason: 'malformed' }
  | { readonly reason: 'unknownScreen'; readonly screen: string }
  | {
      readonly reason: 'invalidParams';
      readonly screen: string;
      readonly issues: readonly FieldIssue[];
    };
