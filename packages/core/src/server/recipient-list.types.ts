import type { Identified } from 'dmg-core';
import type { AnyUiSetDef } from '../manifest/ui-set-def.types';
import type { UcDispatch } from './ucs-dispatch.types';

export type RecipientListSpec<U extends Identified> = {
  readonly set: AnyUiSetDef;
  readonly dispatch: UcDispatch<U>;
};
