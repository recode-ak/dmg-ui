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
        // `check` не бросает (graph-extension §6): свойства не по схеме — строкой.
        const props = v.safeParse(PAGE_ROUTE_PROPS, node.props);
        return props.success
          ? `маршрут ${node.id}: вход ${props.output.entry} не объявлен приложением`
          : `маршрут ${node.id}: свойства узла не по схеме`;
      });
  }
}
