import type { Caller, DomainError, Identified, Result, Trace } from 'dmg-core';
import type { Logger } from 'dmg-core/app';
import type * as v from 'valibot';
import type { ClaimedTraceJson } from './client-input';
import type { UcRoutes } from './uc-routes';
import type { UcDispatch } from './ucs-dispatch.types';

/** Причина из следа клиента, прошедшая схему: запрос или выданный сигнал. */
export type ClaimedTrace = v.InferOutput<typeof ClaimedTraceJson>;

/** След вызова от стороны вызова и признак заявленной причины-события. */
export type ScopedTrace = {
  readonly trace: Trace;
  /** Заявлена причина-событие: command UC с ней не исполняется. */
  readonly event: boolean;
};

/**
 * Сторона вызова: след по сырому следу из `UcCall` (не принят —
 * `undefined`) и вызывающий по этому следу.
 */
export type CallScope<U extends Identified> = {
  trace(raw: unknown): ScopedTrace | undefined;
  resolve(trace: Trace): Promise<Result<Caller<U>, DomainError>>;
};

export type ServerCallsSpec<U extends Identified> = {
  readonly routes: UcRoutes;
  readonly dispatch: UcDispatch<U>;
  readonly logger: Logger;
  readonly source: string;
};
