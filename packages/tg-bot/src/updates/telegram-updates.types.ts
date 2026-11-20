import type {
  ChatEntryPointSpec,
  CommunitySignal,
  ConversationSignal,
} from 'dmg-ui/chat-ui';
import type { ServerContext } from 'dmg-ui/server';
import type * as v from 'valibot';
import type { TelegramMessenger } from '../messenger/telegram-messenger';
import type {
  CallbackQuerySchema,
  ChatMemberUpdatedSchema,
  JoinRequestSchema,
  MemberStatusSchema,
  TelegramMessageSchema,
} from './telegram-update-schema';

/** Сборка перевода апдейтов: таблица точек входа проекта и id бота (`getMe`). */
export type TelegramSignalsSpec = {
  readonly entryPoints: readonly ChatEntryPointSpec[];
  readonly bot: number;
};

/**
 * Сборка приёма апдейтов: узел бесед, мессенджер (ответ на отвергнутое
 * нажатие), логгер, таблица точек входа (та же, что у `ChatAppSpec`), id бота
 * и, если есть сообщество, его приём сигналов (`Communities`): нет — апдейты
 * группы «ничего». Отсев повторов и очередь — в `Communities`.
 */
export type TelegramUpdatesSpec = TelegramSignalsSpec & {
  readonly conversations: {
    receive(signal: ConversationSignal): Promise<void>;
  };
  readonly messenger: TelegramMessenger;
  readonly logger: ServerContext['logger'];
  readonly communities?: {
    receive(signal: CommunitySignal): Promise<void>;
  };
};

/**
 * Причина отказа апдейта: не по схеме, чат не тот (не личный у диалога; не
 * группа с id < 0 у сообщества), отправитель не собеседник (или его нет),
 * нажатие инлайн-режима, нажатие без `data`.
 */
export type UpdateRefusal = 'schema' | 'chat' | 'sender' | 'inline' | 'data';

/** Вид отвергнутого апдейта; у апдейта не по схеме без читаемого нажатия его нет. */
export type RefusedUpdateKind =
  | 'message'
  | 'callback_query'
  | 'my_chat_member'
  | 'chat_member'
  | 'chat_join_request';

/** Отказ апдейта с причиной и видом; у нажатия — его id: ответ обязателен. */
export type RefusedUpdate = {
  readonly kind: 'refused';
  readonly reason: UpdateRefusal;
  readonly update?: RefusedUpdateKind;
  readonly press?: string;
};

/** Итог перевода апдейта: сигнал беседы, сигнал сообщества, отказ, чужой бот (`my_chat_member` не про `bot` проекта) или «ничего» — апдейт вне диалога и группы, без записи. */
export type SignalOutcome =
  | { readonly kind: 'signal'; readonly signal: ConversationSignal }
  | { readonly kind: 'community'; readonly signal: CommunitySignal }
  | RefusedUpdate
  | { readonly kind: 'wrongBot' }
  | { readonly kind: 'ignored' };

/** Сообщение апдейта, сверенное схемой. */
export type TelegramMessage = v.InferOutput<typeof TelegramMessageSchema>;

/** Нажатие апдейта, сверенное схемой. */
export type CallbackQuery = v.InferOutput<typeof CallbackQuerySchema>;

/** Смена статуса участника или бота, сверенная схемой. */
export type ChatMemberUpdated = v.InferOutput<typeof ChatMemberUpdatedSchema>;

/** Заявка на вступление, сверенная схемой. */
export type JoinRequest = v.InferOutput<typeof JoinRequestSchema>;

/** Статус участника, сверенный схемой. */
export type MemberStatus = v.InferOutput<typeof MemberStatusSchema>;
