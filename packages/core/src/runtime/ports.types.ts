import type { SerializedResult, TraceJson } from 'dmg-core';
import type { AddressJson } from '../address/address-codec.types';

/**
 * Вызов UC от узла графа (экран, уведомление, узел канала): имя UC, вход и
 * след. Только JSON: вызывающего в вызове нет, его подставляет сервер.
 */
export type UcCall = {
  readonly node: string;
  readonly uc: string;
  readonly input: unknown;
  readonly trace: TraceJson;
};

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
