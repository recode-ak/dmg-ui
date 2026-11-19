import type { Graph, GraphRule } from 'dmg-core/graph';
import { UiGraphReader } from '../ui-graph-reader';
import { UI_EDGE_KINDS } from '../ui-kinds';

/**
 * UI-24: связь сторис подтверждена переходом — хотя бы одно действие экрана
 * сторис-источника ведёт (`leadsTo`) на стартовый экран сторис-цели. Цель вне
 * графа пропускается: её называет UI-22.
 */
export class StoryLeadsRule implements GraphRule {
  readonly id = 'UI-24';

  check(graph: Graph): readonly string[] {
    const reader = new UiGraphReader(graph);
    const found: string[] = [];
    for (const { node } of reader.stories()) {
      const reached = new Set(
        reader
          .storyScreens(node.id)
          .flatMap((screen) => reader.actionsOf(screen))
          .flatMap((action) =>
            reader.targets(action.node.id, UI_EDGE_KINDS.leadsTo),
          ),
      );
      for (const lead of reader.leadsOf(node.id)) {
        const start = reader.startOf(lead);
        if (start === undefined || reached.has(start)) continue;
        found.push(
          `сторис ${node.id}: связь с ${lead} не подтверждена переходом на её стартовый экран ${start}`,
        );
      }
    }
    return found;
  }
}
