import type { Caller, DomainError, Identified, Result, Trace } from 'dmg-core';
import type { Logger } from 'dmg-core/app';
import type { UcCause } from '../runtime/ports.types';
import type { UcRoutes } from './uc-routes';
import type { UcDispatch } from './ucs-dispatch.types';

/**
 * Сторона вызова: след по причине из `UcCall`, прошедшей схему, и
 * вызывающий по этому следу.
 */
export type CallScope<U extends Identified> = {
  trace(cause: UcCause): Trace;
  resolve(trace: Trace): Promise<Result<Caller<U>, DomainError>>;
};

export type ServerCallsSpec<U extends Identified> = {
  readonly routes: UcRoutes;
  readonly dispatch: UcDispatch<U>;
  readonly logger: Logger;
  readonly source: string;
};
