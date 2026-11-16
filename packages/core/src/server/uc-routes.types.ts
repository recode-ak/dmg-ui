import type { AnyModuleDef, AnyUseCaseDef } from 'dmg-core';
import type { Logger } from 'dmg-core/app';
import type { AnyUiSetDef } from '../manifest/ui-set-def.types';
import type { ChannelNode } from './server.types';

/** Куда идёт вызов: Def UC и его модуль. */
export type UcRoute = {
  readonly uc: AnyUseCaseDef;
  readonly module: AnyModuleDef;
};

export type UcRoutesSpec = {
  readonly set: AnyUiSetDef;
  readonly nodes: readonly ChannelNode[];
  readonly logger: Logger;
  /** Источник записей лога. */
  readonly source: string;
};
