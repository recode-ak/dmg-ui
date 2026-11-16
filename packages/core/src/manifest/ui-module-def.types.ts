import type { DefSpec, DefTexts } from 'dmg-core';
import type { AnyNotificationDef } from './notification-def.types';
import type { AnyScreenDef } from './screen-def.types';
import type { AnyStoryDef } from './story-def.types';
import type { UiModuleDef } from './ui-module-def';

/**
 * Спека UI-модуля. Экраны принадлежат модулю, сторис на них только
 * ссылаются: один экран входит в несколько сторис без копий.
 */
export type UiModuleSpec<N extends string = string> = DefSpec<N> & {
  readonly screens: readonly AnyScreenDef[];
  readonly stories: readonly AnyStoryDef[];
  readonly notifications?: readonly AnyNotificationDef[];
};

/** Любой Def UI-модуля — структурный тип публичных членов. */
export type AnyUiModuleDef = {
  readonly [K in keyof UiModuleDef]: UiModuleDef[K];
};

/** Сериализуемая форма UI-модуля; ссылки — именами. */
export type NormalizedUiModule = DefTexts & {
  readonly dmg: 'uiModule';
  readonly visible: boolean;
  readonly screens: readonly string[];
  readonly stories: readonly string[];
  readonly notifications: readonly string[];
};
