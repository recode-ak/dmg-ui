import type { Graph, GraphRule } from 'dmg-core/graph';
import { UI_EDGE_KINDS } from 'dmg-ui/graph';
import { PAGE_EDGE_KINDS, PAGE_NODE_KINDS } from '../page-kinds';

/**
 * PG-02: у каждого входа приложения канала есть маршрут — экран входа
 * открывает хотя бы один маршрут под приложением. Читает только рёбра
 * (`entry`, `opens`) и узлы `pageRoute`; свойства узла приложения не трогает.
 */
export class EntryRouteRule implements GraphRule {
  readonly id = 'PG-02';

  /** `appIds` — `id` приложений UI канала в графе (`UiIds.app`). */
  constructor(private readonly appIds: readonly string[]) {}

  check(graph: Graph): readonly string[] {
    return this.appIds.flatMap((appId) => EntryRouteRule.missing(graph, appId));
  }

  private static missing(graph: Graph, appId: string): readonly string[] {
    const opened = new Set(
      graph
        .children(appId)
        .filter((node) => node.kind === PAGE_NODE_KINDS.route)
        .flatMap((route) => graph.outgoing(route.id, PAGE_EDGE_KINDS.opens))
        .map((edge) => edge.to),
    );
    const entries = new Set(
      graph.outgoing(appId, UI_EDGE_KINDS.entry).map((edge) => edge.to),
    );
    return [...entries]
      .filter((screen) => !opened.has(screen))
      .map(
        (screen) =>
          `вход приложения ${appId}: экран ${screen} не открыт ни одним маршрутом`,
      );
  }
}
