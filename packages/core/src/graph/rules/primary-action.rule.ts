import type { Graph, GraphRule } from 'dmg-core/graph';
import { UiGraphReader } from '../ui-graph-reader';

/** UI-16: основное действие экрана есть среди его действий. */
export class PrimaryActionRule implements GraphRule {
  readonly id = 'UI-16';

  check(graph: Graph): readonly string[] {
    const reader = new UiGraphReader(graph);
    const found: string[] = [];
    for (const { node, props } of reader.screens()) {
      const { primary } = props;
      if (primary === undefined) continue;
      if (reader.actionNames(node.id).includes(primary)) continue;
      found.push(`экран ${node.id}: основное действие ${primary} не объявлено`);
    }
    return found;
  }
}
