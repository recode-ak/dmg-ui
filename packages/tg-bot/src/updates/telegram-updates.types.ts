import type { ConversationSignal } from 'dmg-ui/chat-ui';
import type { ServerContext } from 'dmg-ui/server';
import type * as v from 'valibot';
import type { TelegramMessenger } from '../messenger/telegram-messenger';
import type {
  CallbackQuerySchema,
  TelegramMessageSchema,
} from './telegram-update.schema';

/** Сборка приёма апдейтов: узел бесед, мессенджер (ответ на отвергнутое нажатие) и логгер. */
export type TelegramUpdatesSpec = {
  readonly conversations: {
    receive(signal: ConversationSignal): Promise<void>;
  };
  readonly messenger: TelegramMessenger;
  readonly logger: ServerContext['logger'];
};

/**
 * Причина отказа апдейта: не по схеме, чат не личный (или id чата ≤ 0),
 * отправитель не собеседник (или его нет), нажатие инлайн-режима, нажатие
 * без `data`.
 */
export type UpdateRefusal = 'schema' | 'chat' | 'sender' | 'inline' | 'data';

/** Вид отвергнутого апдейта; у апдейта не по схеме без читаемого нажатия его нет. */
export type RefusedUpdateKind = 'message' | 'callback_query';

/** Отказ апдейта с причиной и видом; у нажатия — его id: ответ обязателен. */
export type RefusedUpdate = {
  readonly kind: 'refused';
  readonly reason: UpdateRefusal;
  readonly update?: RefusedUpdateKind;
  readonly press?: string;
};

/** Итог перевода апдейта: сигнал беседы, отказ или «ничего» — апдейт вне диалога, без записи. */
export type SignalOutcome =
  | { readonly kind: 'signal'; readonly signal: ConversationSignal }
  | RefusedUpdate
  | { readonly kind: 'ignored' };

/** Сообщение апдейта, сверенное схемой. */
export type TelegramMessage = v.InferOutput<typeof TelegramMessageSchema>;

/** Нажатие апдейта, сверенное схемой. */
export type CallbackQuery = v.InferOutput<typeof CallbackQuerySchema>;
