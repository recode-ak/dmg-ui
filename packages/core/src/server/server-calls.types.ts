import type { Caller, DomainError, Identified, Result } from 'dmg-core';
import type { Logger, Trace } from 'dmg-core/app';
import type { UcRoutes } from './uc-routes';
import type { UcDispatch } from './ucs-dispatch.types';

/** Вызывающий одного вызова по его следу. */
export type ResolveCaller<U extends Identified> = (
  trace: Trace,
) => Promise<Result<Caller<U>, DomainError>>;

export type ServerCallsSpec<U extends Identified> = {
  readonly routes: UcRoutes;
  readonly dispatch: UcDispatch<U>;
  readonly logger: Logger;
  readonly source: string;
};
