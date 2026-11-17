import * as v from 'valibot';

// Схемы ответа Bot API (D-UI-61): пакет не верит транспорту — ответ и
// `result` сверяются, лишние поля не мешают.

/** Ответ порта: успех с любым `result` или отказ с кодом и описанием. */
export const BotApiAnswerSchema = v.variant('ok', [
  v.looseObject({ ok: v.literal(true), result: v.unknown() }),
  v.looseObject({
    ok: v.literal(false),
    error_code: v.pipe(v.number(), v.integer()),
    description: v.string(),
    parameters: v.optional(
      v.looseObject({ retry_after: v.optional(v.number()) }),
    ),
  }),
]);

/** `result` отправки: целый положительный `message_id`. */
export const SentMessageSchema = v.looseObject({
  message_id: v.pipe(v.number(), v.safeInteger(), v.minValue(1)),
});
