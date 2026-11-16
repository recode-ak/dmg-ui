import type { Graph, GraphRule } from 'dmg-core/graph';
import { UiGraphReader } from '../ui-graph-reader';
import { UI_EDGE_KINDS, UI_NODE_KINDS } from '../ui-kinds';

/** UI-12: экран, его действие и уведомление вызывают только UC для человека (`visible`). */
export class ScreenUsesHiddenRule implements GraphRule {
  readonly id = 'UI-12';

  check(graph: Graph): readonly string[] {
    const reader = new UiGraphReader(graph);
    const found: string[] = [];
    const callers = reader.nodes(
      UI_NODE_KINDS.screen,
      UI_NODE_KINDS.action,
      UI_NODE_KINDS.notification,
    );
    for (const node of callers) {
      const called = [
        ...reader.targets(node.id, UI_EDGE_KINDS.reads),
        ...reader.targets(node.id, UI_EDGE_KINDS.invokes),
      ];
      for (const uc of new Set(called)) {
        if (reader.uc(uc) === undefined || graph.node(uc)?.visible) continue;
        found.push(
          `${node.id} вызывает UC ${uc}, не предназначенный человеку (visible: false)`,
        );
      }
    }
    return found;
  }
}
