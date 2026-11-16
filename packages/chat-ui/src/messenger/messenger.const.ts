import type { LengthUnit } from '../limit/limit.types';
import type { CommunityOperation, CommunitySignal } from './messenger.types';

/** Источник записей лога стража лимитов. */
export const LOG_SOURCE = 'chat-ui';

/** Тексты записей лога стража: без данных собеседника. */
export const LIMIT_TEXTS = {
  trimmed: 'текст обрезан по лимиту мессенджера',
  dropped: 'варианты сверх лимита мессенджера отброшены',
} as const;

/** Единицы длины лимита. */
export const LENGTH_UNITS = [
  'grapheme',
  'codePoint',
  'utf16',
  'utf8',
] as const satisfies readonly LengthUnit[];

/** Сигналы сообщества. */
export const COMMUNITY_SIGNALS = [
  'joined',
  'left',
  'added',
  'removed',
] as const satisfies readonly CommunitySignal[];

/** Операции сообщества. */
export const COMMUNITY_OPERATIONS = [
  'exclude',
  'invite',
  'approve',
  'inviteLink',
] as const satisfies readonly CommunityOperation[];
