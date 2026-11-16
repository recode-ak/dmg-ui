import type { Caller, DomainError, Identified, Result, Trace } from 'dmg-core';
import type { Logger } from 'dmg-core/app';
import type { UcRoutes } from './uc-routes';
import type { UcDispatch } from './ucs-dispatch.types';

/** Причина из следа клиента, прошедшая схему: запрос или выданный сигнал. */
export type ClaimedTrace = {
  readonly cause:
    | { readonly kind: 'request'; readonly requestId: string }
    | { readonly kind: 'event'; readonly eventId: string };
  readonly correlationId: string;
};

/**
 * Чья сторона вызывает: настоящий след по заявленному клиентом (не принят —
 * `undefined`) и вызывающий по настоящему следу.
 */
export type CallScope<U extends Identified> = {
  trace(claimed: ClaimedTrace): Trace | undefined;
  resolve(trace: Trace): Promise<Result<Caller<U>, DomainError>>;
};

export type ServerCallsSpec<U extends Identified> = {
  readonly routes: UcRoutes;
  readonly dispatch: UcDispatch<U>;
  readonly logger: Logger;
  readonly source: string;
};
