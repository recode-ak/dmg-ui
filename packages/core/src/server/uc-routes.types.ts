import type { AnyModuleDef, AnyUseCaseDef } from 'dmg-core';
import type { Logger } from 'dmg-core/app';
import type { AnyUiSetDef } from '../manifest/ui-set-def.types';

/** Куда идёт вызов: Def UC и его модуль. */
export type UcRoute = {
  readonly uc: AnyUseCaseDef;
  readonly module: AnyModuleDef;
};

/** Узел с объявленными UC: экран, уведомление или узел канала. */
export type RouteNode = {
  readonly id: string;
  readonly uses: readonly AnyUseCaseDef[];
};

export type UcRoutesSpec = {
  readonly set: AnyUiSetDef;
  readonly logger: Logger;
  /** Источник записей лога. */
  readonly source: string;
};
