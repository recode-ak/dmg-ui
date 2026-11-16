import * as v from 'valibot';

// Схемы недоверенного вызова UC: предел длины строк — от клиента сессии;
// внутренний путь уведомителя проходит их же, его значения в пределе.

/** Предел длины строк клиента: модуль, UC и идентификатор причины. */
const MAX_LENGTH = 256;

/** Строка-идентификатор клиента: непустая, не длиннее предела. */
export const ClientId = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(MAX_LENGTH),
);

/**
 * Причина вызова от клиента: ровно одно из `requestId` и `eventId`. Ни
 * одного или оба — не по схеме; прочие поля вызова (`trace`, `channel`,
 * `correlationId`) схема не берёт — след собирает сервер.
 */
export const ClaimedCause = v.union([
  v.object({ requestId: ClientId, eventId: v.optional(v.never()) }),
  v.object({ eventId: ClientId, requestId: v.optional(v.never()) }),
]);
