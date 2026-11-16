import { type AnyAppDef, Def } from 'dmg-core';
import type { AnyUiModuleDef } from './ui-module-def.types';
import type { NormalizedUiSet, UiSetSpec } from './ui-set-def.types';

export type {
  AnyUiSetDef,
  NormalizedUiSet,
  UiSetSpec,
} from './ui-set-def.types';

/**
 * Манифест набора UI: UI-модули одного доменного приложения. Корень `id`
 * экранов (`UiIds`) и адресов (`AddressCodec`).
 */
export class UiSetDef<N extends string = string> extends Def<N> {
  readonly dmg = 'uiSet';
  readonly app: AnyAppDef;
  readonly modules: readonly AnyUiModuleDef[];

  constructor(spec: UiSetSpec<N>) {
    super(spec);
    this.app = spec.app;
    this.modules = spec.modules;
  }

  static define<const N extends string>(spec: UiSetSpec<N>): UiSetDef<N> {
    return new UiSetDef<N>(spec);
  }

  normalize(): NormalizedUiSet {
    return {
      dmg: this.dmg,
      ...this.texts(),
      visible: this.visible,
      app: this.app.name,
      modules: this.modules.map((m) => m.name),
    };
  }
}
