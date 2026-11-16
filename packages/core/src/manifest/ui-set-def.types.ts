import type { AnyAppDef, DefSpec, DefTexts } from 'dmg-core';
import type { AnyUiModuleDef } from './ui-module-def.types';
import type { UiSetDef } from './ui-set-def';

/** Спека набора UI: доменное приложение и UI-модули поверх него. */
export type UiSetSpec<N extends string = string> = DefSpec<N> & {
  /** Доменное приложение: его `DomainIds` и модули UC — для графа и исполнителя. */
  readonly app: AnyAppDef;
  readonly modules: readonly AnyUiModuleDef[];
};

/** Любой Def набора UI — структурный тип публичных членов. */
export type AnyUiSetDef = {
  readonly [K in keyof UiSetDef]: UiSetDef[K];
};

/** Сериализуемая форма набора UI; ссылки — именами. */
export type NormalizedUiSet = DefTexts & {
  readonly dmg: 'uiSet';
  readonly visible: boolean;
  readonly app: string;
  readonly modules: readonly string[];
};
