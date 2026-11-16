import type { Graph, GraphRule } from 'dmg-core/graph';
import { UiGraphReader } from '../ui-graph-reader';
import { UI_EDGE_KINDS, UI_NODE_KINDS } from '../ui-kinds';

/** UI-09: действие вызывает только command UC. */
export class InvokesOnlyCommandRule implements GraphRule {
  readonly id = 'UI-09';

  check(graph: Graph): readonly string[] {
    const reader = new UiGraphReader(graph);
    const found: string[] = [];
    for (const node of reader.nodes(UI_NODE_KINDS.action)) {
      for (const uc of reader.targets(node.id, UI_EDGE_KINDS.invokes)) {
        if (reader.uc(uc)?.type !== 'query') continue;
        found.push(
          `действие ${node.id} вызывает query UC ${uc}: чтение — в загрузке экрана`,
        );
      }
    }
    return found;
  }
}
