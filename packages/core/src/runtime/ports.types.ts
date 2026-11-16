import type { SerializedResult, TraceJson } from 'dmg-core';
import type { AddressJson } from '../address/address-codec.types';

/**
 * Причина вызова UC: `requestId` запроса канала или `eventId` сигнала
 * перечитывания. Ровно одно поле; полный след из неё собирает сервер.
 */
export type UcCause =
  | { readonly requestId: string }
  | { readonly eventId: string };

/**
 * Простая команда вызова UC: модуль и имя UC, вход и причина. Только JSON:
 * ни узла графа, ни следа, ни вызывающего в вызове нет — сервер сверяет
 * пару `(module, uc)` с объявленным сессией и сам подставляет след и
 * вызывающего.
 */
export type UcCall = {
  readonly module: string;
  readonly uc: string;
  readonly input: unknown;
} & UcCause;

/** Порт вызова UC: ответ — в форме транспорта, Def восстанавливает его сам. */
export type UcPort = {
  call(call: UcCall): Promise<SerializedResult>;
};

/** Сигнал перечитывания: событие и его след, без payload. */
export type RefreshSignal = {
  readonly event: string;
  readonly eventId: string;
  readonly trace: TraceJson;
};

/** Порт перечитывания: подписка экземпляра по адресу; возвращает отписку. */
export type RefreshPort = {
  watch(
    address: AddressJson,
    listener: (signal: RefreshSignal) => void,
  ): () => void;
};
