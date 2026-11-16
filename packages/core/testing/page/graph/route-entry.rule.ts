import type { Graph, GraphRule } from 'dmg-core/graph';
import * as v from 'valibot';
import {
  PAGE_EDGE_KINDS,
  PAGE_NODE_KINDS,
  PAGE_ROUTE_PROPS,
} from './page-kinds';

/** PG-01: маршрут ведёт на вход, который объявило приложение UI (есть ребро `opens`). */
export class RouteEntryRule implements GraphRule {
  readonly id = 'PG-01';

  check(graph: Graph): readonly string[] {
    return graph
      .nodes()
      .filter(
        (node) =>
          node.kind === PAGE_NODE_KINDS.route &&
          graph.outgoing(node.id, PAGE_EDGE_KINDS.opens).length === 0,
      )
      .map((node) => {
        const { entry } = v.parse(PAGE_ROUTE_PROPS, node.props);
        return `маршрут ${node.id}: вход ${entry} не объявлен приложением`;
      });
  }
}
