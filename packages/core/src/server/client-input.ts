import * as v from 'valibot';

// Схемы ввода клиента сессии: предел длины строк — только для клиента;
// внутренний путь уведомителя через них не идёт.

/** Предел длины строк клиента: узел, UC и идентификаторы следа. */
const MAX_LENGTH = 256;

/** Строка-идентификатор клиента: непустая, не длиннее предела. */
export const ClientId = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(MAX_LENGTH),
);

/**
 * Заявленный клиентом след: `generated` и `channel` схема не берёт;
 * причина-прогон Job — не по схеме.
 */
export const ClaimedTraceJson = v.object({
  cause: v.variant('kind', [
    v.object({ kind: v.literal('request'), requestId: ClientId }),
    v.object({ kind: v.literal('event'), eventId: ClientId }),
  ]),
  correlationId: ClientId,
});
