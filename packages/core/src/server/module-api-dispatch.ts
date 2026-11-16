import {
  type AnyModuleDef,
  CoreErrors,
  ErrorDef,
  err,
  type Identified,
  type SerializedResult,
  UseCaseDef,
} from 'dmg-core';
import type { ModuleApi } from 'dmg-core/app';
import type { UcDispatch, UcRequest } from './ucs-dispatch.types';

/**
 * Вызов UC модулей вне процесса через их `ModuleApi`. Модуль без клиента —
 * `OPERATION_NOT_FOUND`, как у `ApiApp.dispatchByName`.
 */
export class ModuleApiDispatch<U extends Identified> implements UcDispatch<U> {
  private readonly apis: ReadonlyMap<AnyModuleDef, ModuleApi<AnyModuleDef, U>>;

  constructor(apis: readonly ModuleApi<AnyModuleDef, U>[]) {
    this.apis = new Map(apis.map((api) => [api.def, api]));
  }

  async dispatch({
    module,
    uc,
    input,
    caller,
    trace,
  }: UcRequest<U>): Promise<SerializedResult> {
    const api = this.apis.get(module);
    if (api === undefined) {
      const error = CoreErrors.OPERATION_NOT_FOUND.make({
        module: module.name,
        uc: uc.name,
      });
      return err(ErrorDef.serialize(error));
    }
    const result = await api.dispatch(
      UseCaseDef.commandOf(uc, input),
      caller,
      trace,
    );
    return uc.serializeResult(result);
  }
}
