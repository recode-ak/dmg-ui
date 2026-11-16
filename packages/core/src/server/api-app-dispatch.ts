import { type Identified, type SerializedResult, UseCaseDef } from 'dmg-core';
import type { ApiApp } from 'dmg-core/app';
import type { UcDispatch, UcRequest } from './ucs-dispatch.types';

/** Вызов UC приложения в том же процессе: `ApiApp.dispatchByName` (ARC-08). */
export class ApiAppDispatch<U extends Identified> implements UcDispatch<U> {
  constructor(private readonly api: ApiApp<U>) {}

  async dispatch({
    module,
    uc,
    input,
    caller,
    trace,
  }: UcRequest<U>): Promise<SerializedResult> {
    const result = await this.api.dispatchByName(
      module.name,
      UseCaseDef.commandOf(uc, input),
      caller,
      trace,
    );
    return uc.serializeResult(result);
  }
}
