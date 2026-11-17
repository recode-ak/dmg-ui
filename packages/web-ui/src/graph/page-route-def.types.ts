import type { DefOf, DefSpec, DefTexts } from 'dmg-core';

/** Спека маршрута: путь страницы и вход приложения UI, который он открывает. */
export type PageRouteSpec<N extends string = string> = DefSpec<N> & {
  /** Путь страницы, строка без параметров: `/`, `/assigned`. */
  readonly path: string;
  /** Имя входа приложения UI (`UiAppDef.entries`); ссылка — именем. */
  readonly entry: string;
};

/** Сериализуемая форма маршрута; вход — именем. */
export type NormalizedPageRoute = DefTexts & {
  readonly dmg: 'pageRoute';
  readonly visible: boolean;
  readonly path: string;
  readonly entry: string;
};

/** Любой Def маршрута — структурный тип публичных членов. */
export type AnyPageRouteDef = DefOf<'pageRoute', NormalizedPageRoute> & {
  readonly path: string;
  readonly entry: string;
};
