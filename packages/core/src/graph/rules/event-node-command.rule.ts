import type { Graph, GraphRule } from 'dmg-core/graph';
import { UiGraphReader } from '../ui-graph-reader';
import { UI_EDGE_KINDS } from '../ui-kinds';

/**
 * UI-10: узел, привязанный к событию, не вызывает command UC ни по `reads`,
 * ни по `invokes`. Защита для узлов каналов; для экрана и уведомления ядра
 * дублирует UI-08.
 */
export class EventNodeCommandRule implements GraphRule {
  readonly id = 'UI-10';

  check(graph: Graph): readonly string[] {
    const reader = new UiGraphReader(graph);
    const found: string[] = [];
    for (const node of graph.nodes()) {
      const bound =
        reader.targets(node.id, UI_EDGE_KINDS.refreshedBy).length > 0 ||
        reader.targets(node.id, UI_EDGE_KINDS.notifiedBy).length > 0;
      if (!bound) continue;
      const called = [
        ...reader.targets(node.id, UI_EDGE_KINDS.reads),
        ...reader.targets(node.id, UI_EDGE_KINDS.invokes),
      ];
      for (const uc of new Set(called)) {
        if (reader.uc(uc)?.type !== 'command') continue;
        found.push(`${node.id} привязан к событию и вызывает command UC ${uc}`);
      }
    }
    return found;
  }
}
