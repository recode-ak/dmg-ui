import type { Graph, GraphRule } from 'dmg-core/graph';
import { UiGraphReader } from '../ui-graph-reader';
import { UI_EDGE_KINDS, UI_NODE_KINDS } from '../ui-kinds';

/**
 * UI-03: у экрана и цели перехода есть общая сторис. Экран — вход приложения
 * UI из правила исключён: меню ведёт на экраны разных сторис.
 */
export class TransitionOutsideStoryRule implements GraphRule {
  readonly id = 'UI-03';

  check(graph: Graph): readonly string[] {
    const reader = new UiGraphReader(graph);
    const found: string[] = [];
    for (const edge of graph.edges()) {
      if (edge.kind !== UI_EDGE_KINDS.leadsTo) continue;
      if (reader.kindOf(edge.from) !== UI_NODE_KINDS.action) continue;
      const source = graph.node(edge.from)?.parent;
      if (
        source === undefined ||
        reader.kindOf(edge.to) !== UI_NODE_KINDS.screen
      ) {
        continue;
      }
      if (reader.sources(source, UI_EDGE_KINDS.entry).length > 0) continue;
      const shared = reader
        .storiesOf(source)
        .some((story) => reader.storiesOf(edge.to).includes(story));
      if (!shared) {
        found.push(
          `действие ${edge.from} ведёт на экран ${edge.to}, с которым у экрана нет общей сторис`,
        );
      }
    }
    return found;
  }
}
