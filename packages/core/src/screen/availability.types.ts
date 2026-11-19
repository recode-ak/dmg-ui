/**
 * Ответ кода экрана о действии (D-UI-98): доступно; скрыто — субъекту
 * действие не положено, текста нет; отключено — сейчас нельзя, с причиной.
 */
export type AvailabilityAnswer =
  | { readonly kind: 'available' }
  | { readonly kind: 'hidden' }
  | { readonly kind: 'disabled'; readonly text: string };

/**
 * Ответ в виде экземпляра: скрытое в вид не попадает, поэтому у вида два
 * ответа — доступно и отключено с причиной.
 */
export type ViewAvailability =
  | { readonly kind: 'available' }
  | { readonly kind: 'disabled'; readonly text: string };
