import type { DefSpec, DefTexts } from 'dmg-core';
import type { Address } from '../address/address';
import type { AnyNotificationDef } from './notification-def.types';
import type { AnyStoryDef } from './story-def.types';
import type { UiAppDef } from './ui-app-def';
import type { AnyUiSetDef } from './ui-set-def.types';

/** Вход приложения UI: точка старта, к которой канал привязывает команду и возврат «в начало». */
export type EntrySpec = {
  readonly label: string;
  readonly description: string;
  /** Адрес строится в манифесте: `MenuScreenDef.at({})`. */
  readonly address: Address;
};

/** Спека приложения UI: набор, канал, сторис, уведомления и входы. */
export type UiAppSpec<N extends string = string> = DefSpec<N> & {
  readonly set: AnyUiSetDef;
  /** Имя пакета канала. */
  readonly channel: string;
  readonly stories: readonly AnyStoryDef[];
  /** Уведомления приложения — явный список, по умолчанию пустой. */
  readonly notifications?: readonly AnyNotificationDef[];
  readonly entries: Readonly<Record<string, EntrySpec>>;
};

/** Любой Def приложения UI — структурный тип публичных членов. */
export type AnyUiAppDef = {
  readonly [K in keyof UiAppDef]: UiAppDef[K];
};

/** Сериализуемая форма входа: экран — именем, параметры — как в адресе. */
export type NormalizedEntry = DefTexts & {
  readonly screen: string;
  readonly params: unknown;
};

/** Сериализуемая форма приложения UI; ссылки — именами. */
export type NormalizedUiApp = DefTexts & {
  readonly dmg: 'uiApp';
  readonly visible: boolean;
  readonly set: string;
  readonly channel: string;
  readonly stories: readonly string[];
  readonly notifications: readonly string[];
  readonly entries: readonly NormalizedEntry[];
};
