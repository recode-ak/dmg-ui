/** Узел `pageRoute` с валидными свойствами; `app` — `id` приложения UI над ним. */
export type PageRouteNode = {
  readonly id: string;
  readonly app: string;
  readonly path: string;
  readonly entry: string;
};

/** Узел `screen`: имена модуля и экрана — из `id`, `params` — JSON Schema параметров. */
export type PageScreenNode = {
  readonly id: string;
  readonly module: string;
  readonly name: string;
  readonly params: Readonly<Record<string, unknown>>;
};
