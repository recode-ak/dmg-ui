import type { Graph, GraphRule } from 'dmg-core/graph';
import { UiGraphReader } from '../ui-graph-reader';
import { UI_EDGE_KINDS, UI_NODE_KINDS } from '../ui-kinds';

/** UI-08: загрузка экрана и уведомление читают только query UC. */
export class ReadsOnlyQueryRule implements GraphRule {
  readonly id = 'UI-08';

  check(graph: Graph): readonly string[] {
    const reader = new UiGraphReader(graph);
    const found: string[] = [];
    const owners = reader.nodes(
      UI_NODE_KINDS.screen,
      UI_NODE_KINDS.notification,
    );
    for (const node of owners) {
      const what = node.kind === UI_NODE_KINDS.screen ? 'экран' : 'уведомление';
      for (const uc of reader.targets(node.id, UI_EDGE_KINDS.reads)) {
        if (reader.uc(uc)?.type !== 'command') continue;
        found.push(`${what} ${node.id} читает command UC ${uc}`);
      }
    }
    return found;
  }
}
