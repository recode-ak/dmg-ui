import type { Graph, GraphNode, GraphRule } from 'dmg-core/graph';
import { UI_NODE_KINDS } from 'dmg-ui/graph';
import { ChatIds } from '../chat-ids';
import { CHAT_EDGE_KINDS, CHAT_NODE_KINDS } from '../chat-kinds';

/**
 * CH-02 (D-UI-57): у каждого входа беседы `chatEntry` под приложением UI
 * есть входящее ребро `chatOpens` от точки входа `chatEntryPoint` под тем же
 * приложением. Читает только узлы и рёбра: свойства не трогает, имя входа —
 * из `id` узла; `check` не бросает.
 */
export class EntryPointRule implements GraphRule {
  readonly id = 'CH-02';

  check(graph: Graph): readonly string[] {
    return graph
      .nodes()
      .filter((node) => node.kind === UI_NODE_KINDS.app)
      .flatMap((app) =>
        graph
          .children(app.id)
          .filter((node) => node.kind === CHAT_NODE_KINDS.entry)
          .filter((entry) => !EntryPointRule.opened(graph, app.id, entry))
          .map(
            (entry) =>
              `вход ${ChatIds.entryName(entry.id)} приложения ${app.id}: нет точки входа`,
          ),
      );
  }

  /** Есть ли у входа ребро `chatOpens` от узла точки входа приложения `app`. */
  private static opened(graph: Graph, app: string, entry: GraphNode): boolean {
    return graph.incoming(entry.id, CHAT_EDGE_KINDS.opens).some((edge) => {
      const from = graph.node(edge.from);
      return from?.kind === CHAT_NODE_KINDS.point && from.parent === app;
    });
  }
}
