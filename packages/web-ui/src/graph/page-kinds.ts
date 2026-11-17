import type { GraphKinds } from 'dmg-core/graph';
import * as v from 'valibot';

/** Имена видов узлов страничного канала. */
export const PAGE_NODE_KINDS = { route: 'pageRoute' } as const;

/** Имена видов рёбер страничного канала. */
export const PAGE_EDGE_KINDS = { opens: 'opens' } as const;

/** Свойства узла маршрута: путь и имя входа приложения UI. */
export const PAGE_ROUTE_PROPS = v.strictObject({
  path: v.string(),
  entry: v.string(),
});

/** Виды узлов и рёбер поставщика страничного канала; данные, как `DOMAIN_KINDS`. */
export const PAGE_KINDS: GraphKinds = {
  nodes: [
    {
      kind: PAGE_NODE_KINDS.route,
      label: 'Маршрут страницы',
      description: 'Путь страницы, открывающий вход приложения UI.',
      props: PAGE_ROUTE_PROPS,
    },
  ],
  edges: [
    {
      kind: PAGE_EDGE_KINDS.opens,
      label: 'Открывает экран',
      description: 'Маршрут открывает экран входа приложения UI.',
    },
  ],
};
