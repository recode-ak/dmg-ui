import type { BotApiFailure } from './bot-api-failure';

/** Итог вызова порта: ответ, отказ Bot API или сбой (бросок, ответ не по схеме). */
export type BotApiOutcome =
  | { readonly kind: 'done'; readonly result: unknown }
  | { readonly kind: 'refused'; readonly failure: BotApiFailure }
  | { readonly kind: 'failed' };
