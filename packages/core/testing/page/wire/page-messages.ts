import { ERROR_KINDS, ok, type SerializedResult } from 'dmg-core';
import type { UcCall } from 'dmg-ui';
import * as v from 'valibot';
import type {
  ClientMessage as ClientMessageType,
  ServerMessage as ServerMessageType,
} from './page-messages.types';

// Схемы сообщений страничного канала. Сообщения клиента и конверты сообщений
// сервера строгие: лишнее поле — не по схеме (так через провод не проходят
// `trace`, `caller`, `recipient`, payload). Вложенные формы `dmg-core` в
// сообщениях сервера (ошибка результата, след, контекст) — без строгости:
// новое поле `dmg-core` отбрасывается, а не роняет сообщение. Аннотация
// `GenericSchema<unknown, …>` сверяет выход схемы с типами `.types.ts`.

/** Предел длины строк-идентификаторов провода (Т-17). */
const MAX_ID = 256;

/** Строка-идентификатор провода: непустая, не длиннее 256 символов. */
export const PageId = v.pipe(v.string(), v.minLength(1), v.maxLength(MAX_ID));

const Address = v.strictObject({ screen: PageId, params: v.unknown() });

/**
 * Простая команда: ровно одна причина. JSON теряет `input: undefined`
 * (UC без входа) — схема возвращает поле, и сервер видит тот же вызов, что
 * и канал в одном процессе.
 */
const Call = v.pipe(
  v.union([
    v.strictObject({
      module: PageId,
      uc: PageId,
      input: v.optional(v.unknown()),
      requestId: PageId,
    }),
    v.strictObject({
      module: PageId,
      uc: PageId,
      input: v.optional(v.unknown()),
      eventId: PageId,
    }),
  ]),
  v.transform((call): UcCall => ({ ...call, input: call.input })),
);

const Trace = v.object({
  cause: v.variant('kind', [
    v.object({
      kind: v.literal('request'),
      requestId: PageId,
      generated: v.optional(v.literal(true)),
    }),
    v.object({ kind: v.literal('event'), eventId: PageId }),
    v.object({ kind: v.literal('job'), job: PageId, runId: PageId }),
  ]),
  correlationId: PageId,
  channel: v.optional(
    v.object({ name: PageId, visitorId: v.optional(PageId) }),
  ),
});

/** `SerializedResult`: JSON теряет `value: undefined` (UC без выхода) — схема его возвращает. */
const Result = v.union([
  v.pipe(
    v.strictObject({ ok: v.literal(true), value: v.optional(v.unknown()) }),
    v.transform((res): SerializedResult => ok(res.value)),
  ),
  v.strictObject({
    ok: v.literal(false),
    error: v.object({
      code: PageId,
      kind: v.picklist(ERROR_KINDS),
      payload: v.optional(v.unknown()),
    }),
  }),
]);

/** Схема сообщения клиента — граница, на которой сервер отвечает `refused`. */
export const ClientMessage: v.GenericSchema<unknown, ClientMessageType> =
  v.variant('kind', [
    v.strictObject({ kind: v.literal('call'), id: PageId, call: Call }),
    v.strictObject({
      kind: v.literal('watch'),
      watch: PageId,
      address: Address,
    }),
    v.strictObject({ kind: v.literal('unwatch'), watch: PageId }),
  ]);

/** Схема сообщения сервера — граница, которую проверяет клиентский конец провода. */
export const ServerMessage: v.GenericSchema<unknown, ServerMessageType> =
  v.variant('kind', [
    v.strictObject({
      kind: v.literal('hello'),
      context: v.object({
        locale: PageId,
        timeZone: PageId,
        delegate: v.boolean(),
        readOnly: v.boolean(),
      }),
    }),
    v.strictObject({ kind: v.literal('result'), id: PageId, result: Result }),
    v.strictObject({
      kind: v.literal('signal'),
      watch: PageId,
      signal: v.strictObject({ event: PageId, eventId: PageId, trace: Trace }),
    }),
    v.strictObject({ kind: v.literal('watch-refused'), watch: PageId }),
    v.strictObject({
      kind: v.literal('notification'),
      notification: PageId,
      data: v.unknown(),
      links: v.array(Address),
      eventId: PageId,
    }),
    v.strictObject({
      kind: v.literal('refused'),
      reason: v.picklist(['malformed', 'too-large']),
      id: v.optional(PageId),
    }),
  ]);

/** Конверт вызова без проверки `call`: `id`, которому сервер адресует отказ. */
export const CallEnvelope = v.object({ kind: v.literal('call'), id: PageId });
