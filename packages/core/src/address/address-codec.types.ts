/**
 * Адрес в форме JSON: `id` экрана и параметры. Строку из него (данные
 * действия, ссылку) делает канал.
 */
export type AddressJson = {
  readonly screen: string;
  readonly params: unknown;
};

/** Замечание схемы: ключ первого уровня (если есть) и текст схемы. */
export type FieldIssue = {
  readonly field?: string;
  readonly text: string;
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
