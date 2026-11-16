import type {
  AnyModuleDef,
  AnyUseCaseDef,
  Caller,
  Identified,
  SerializedResult,
} from 'dmg-core';
import type { Trace } from 'dmg-core/app';

/** Вызов UC, сверенный сервером: Def, модуль-владелец, вызывающий и след. */
export type UcRequest<U extends Identified> = {
  readonly module: AnyModuleDef;
  readonly uc: AnyUseCaseDef;
  /** Вход клиента как есть: его проверяет схема UC при исполнении. */
  readonly input: unknown;
  readonly caller: Caller<U>;
  readonly trace: Trace;
};

/** Бэкенд вызова UC сервера UI: ответ — в форме транспорта. */
export type UcDispatch<U extends Identified> = {
  dispatch(request: UcRequest<U>): Promise<SerializedResult>;
};
